import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'demo-missingalert';
const splitHost = (value, fallbackPort) => {
  const [host = '127.0.0.1', rawPort = String(fallbackPort)] = (value || '').split(':');
  return { host, port: Number(rawPort) };
};

const firestore = splitHost(process.env.FIRESTORE_EMULATOR_HOST, 8080);
const storage = splitHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore,
    storage,
  });
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'publicReports', 'approved-report'), {
      visibility: 'public',
      status: 'approved',
      publicDescription: '검토 완료 공개 문구',
    });
    await setDoc(doc(db, 'publicReports', 'pending-report'), {
      visibility: 'private',
      status: 'pending',
    });
    await setDoc(doc(db, 'publicReports', 'forwarded-report'), {
      visibility: 'public',
      status: 'forwarded',
      publicDescription: '관계기관 전달 공개 문구',
    });
    await setDoc(doc(db, 'publicReports', 'withdrawn-report'), {
      visibility: 'public',
      status: 'withdrawn',
      publicDescription: '공개되면 안 되는 취소 제보',
    });
    await setDoc(doc(db, 'sightingReports', 'private-report'), {
      ownerUid: 'user-a',
      exactLocation: { lat: 37.5, lng: 127 },
    });
    await uploadBytes(
      ref(context.storage(), 'report-public/approved-report/image.webp'),
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      { contentType: 'image/webp' }
    );
    await uploadBytes(
      ref(context.storage(), 'report-public/orphan-report/image.webp'),
      new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      { contentType: 'image/webp' }
    );
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

describe('Firestore reporting security boundary', () => {
  test('anonymous users read only approved public projections', async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();
    const approved = await assertSucceeds(getDoc(doc(db, 'publicReports', 'approved-report')));
    assert.equal(approved.exists(), true);
    const forwarded = await assertSucceeds(getDoc(doc(db, 'publicReports', 'forwarded-report')));
    assert.equal(forwarded.exists(), true);
    await assertFails(getDoc(doc(db, 'publicReports', 'pending-report')));
    await assertFails(getDoc(doc(db, 'publicReports', 'withdrawn-report')));
  });

  test('private reports are inaccessible even to their owner', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    await assertFails(getDoc(doc(db, 'sightingReports', 'private-report')));
    await assertFails(setDoc(doc(db, 'sightingReports', 'new-report'), { ownerUid: 'user-a' }));
  });

  test('official cases and public projections cannot be changed by client SDKs', async () => {
    const userDb = testEnvironment.authenticatedContext('user-a').firestore();
    const adminDb = testEnvironment.authenticatedContext('admin-a', { admin: true }).firestore();
    await assertFails(setDoc(doc(userDb, 'missingPersons', 'case-a'), { name: 'client write' }));
    await assertFails(setDoc(doc(adminDb, 'missingPersons', 'case-a'), { name: 'admin client write' }));
    await assertFails(setDoc(doc(adminDb, 'publicReports', 'approved-report'), { visibility: 'public', status: 'approved' }));
  });

  test('hardcoded identity and legacy admin claim have no authority while an approved role does', async () => {
    const hardcodedDb = testEnvironment.authenticatedContext('legacy-admin', {
      email: 'jmgi1024@gmail.com',
    }).firestore();
    const legacyClaimDb = testEnvironment.authenticatedContext('legacy-claim-admin', { admin: true }).firestore();
    const claimedDb = testEnvironment.authenticatedContext('claimed-admin', { systemAdmin: true }).firestore();
    await assertFails(setDoc(doc(hardcodedDb, 'announcements', 'blocked'), { text: 'blocked' }));
    await assertFails(setDoc(doc(legacyClaimDb, 'announcements', 'legacy-blocked'), { text: 'blocked' }));
    await assertSucceeds(setDoc(doc(claimedDb, 'announcements', 'allowed'), { text: 'allowed' }));
  });

  test('runtime, subscription, preference, media, and banner records stay server-only', async () => {
    const db = testEnvironment.authenticatedContext('user-a').firestore();
    for (const [collectionName, id] of [
      ['runtimeConfig', 'reporting'],
      ['reportRateLimits', 'user-a-window'],
      ['notificationSubscriptions', 'user-a'],
      ['dashboardPreferences', 'user-a'],
      ['reportMediaDrafts', 'draft-a'],
      ['siteBanners', 'banner-a'],
    ]) {
      await assertFails(getDoc(doc(db, collectionName, id)));
      await assertFails(setDoc(doc(db, collectionName, id), { ownerUid: 'user-a' }));
    }
  });

  test('FCM token documents stay server-only', async () => {
    const ownerDb = testEnvironment.authenticatedContext('user-a').firestore();
    const otherDb = testEnvironment.authenticatedContext('user-b').firestore();
    const now = Timestamp.now();
    const token = 'browser-token:example_value';
    const validDocument = {
      userId: 'user-a',
      tokens: {
        [token]: {
          token,
          createdAt: now,
          lastSeenAt: now,
          userAgent: 'Zen Browser test',
          platform: 'windows',
        },
      },
      updatedAt: now,
      lastPrunedAt: now,
    };

    await assertFails(setDoc(doc(ownerDb, 'userTokens', 'user-a'), validDocument));
    await assertFails(getDoc(doc(ownerDb, 'userTokens', 'user-a')));
    await assertFails(setDoc(doc(otherDb, 'userTokens', 'user-a'), validDocument));
    await assertFails(setDoc(doc(ownerDb, 'userTokens', 'user-a'), {
      ...validDocument,
      unexpectedField: true,
    }));
  });
});

describe('Storage reporting security boundary', () => {
  test('owners may upload only to their exact private draft path', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    await assertSucceeds(uploadBytes(
      ref(ownerStorage, 'report-private/user-a/drafts/draft-a/media-a'),
      new Uint8Array([0xff, 0xd8, 0xff]),
      { contentType: 'image/jpeg' }
    ));
    const otherStorage = testEnvironment.authenticatedContext('user-b').storage();
    await assertFails(uploadBytes(
      ref(otherStorage, 'report-private/user-a/drafts/draft-a/media-b'),
      new Uint8Array([0xff, 0xd8, 0xff]),
      { contentType: 'image/jpeg' }
    ));
  });

  test('private originals stay unreadable and public approved media stays readable', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    await assertFails(getBytes(ref(ownerStorage, 'report-private/user-a/drafts/draft-a/media-a')));
    const anonymousStorage = testEnvironment.unauthenticatedContext().storage();
    const bytes = await assertSucceeds(getBytes(ref(anonymousStorage, 'report-public/approved-report/image.webp')));
    assert.equal(bytes.byteLength, 4);
    await assertFails(getBytes(ref(anonymousStorage, 'report-public/orphan-report/image.webp')));
  });

  test('clients cannot write normalized, quarantine, or public media', async () => {
    const ownerStorage = testEnvironment.authenticatedContext('user-a').storage();
    for (const target of [
      'report-private/user-a/normalized/image.webp',
      'report-quarantine/user-a/image.jpg',
      'report-public/approved-report/client.webp',
    ]) {
      await assertFails(uploadBytes(ref(ownerStorage, target), new Uint8Array([1]), { contentType: 'image/webp' }));
    }
  });
});
