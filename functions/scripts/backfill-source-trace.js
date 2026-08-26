#!/usr/bin/env node
const crypto = require('crypto');
const admin = require('firebase-admin');
const {getGcloudCredential} = require('./gcloud-credential.js');

const rawArgs = process.argv.slice(2);
const apply = rawArgs.includes('--apply');
const confirmation = rawArgs.find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'missing-person-alram';

if (apply && confirmation !== projectId) {
  throw new Error(`Apply requires --confirm=${projectId}`);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
    ...(process.env.USE_GCLOUD_CREDENTIAL === 'true' ? {credential: getGcloudCredential()} : {}),
  });
}

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

const sourceRecordKey = (id) => crypto.createHash('sha256').update(id).digest('hex');

(async () => {
  const [cases, syncState] = await Promise.all([
    db.collection('missingPersons').get(),
    db.collection('syncMetadata').doc('safe182MissingPersons').get(),
  ]);
  const lastCheckedAt = syncState.data()?.lastCheckedAt || null;
  const candidates = cases.docs.filter((doc) => {
    const data = doc.data();
    return data.source === 'api' && (!data.sourceTrace || !data.visibility || !data.sync || data.schemaVersion !== 2);
  });

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    scanned: cases.size,
    eligible: candidates.length,
    unchanged: cases.size - candidates.length,
    sourceId: 'safe182_missing_persons',
  };

  if (!apply) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  for (let offset = 0; offset < candidates.length; offset += 400) {
    const batch = db.batch();
    candidates.slice(offset, offset + 400).forEach((doc) => {
      const data = doc.data();
      batch.set(doc.ref, {
        schemaVersion: 2,
        sourceTrace: {
          agency: '경찰청',
          sourceId: 'safe182_missing_persons',
          sourceRecordKey: sourceRecordKey(doc.id),
          officialUrl: 'https://www.safe182.go.kr/',
          firstIngestedAt: data.sourceTrace?.firstIngestedAt || data.updatedAt || serverTimestamp(),
          lastCheckedAt: lastCheckedAt || data.sourceLastSeenAt || data.updatedAt || serverTimestamp(),
        },
        visibility: {public: data.status === 'active', searchable: data.status === 'active', shareable: data.status === 'active'},
        sync: {
          sourceHash: data.contentFingerprint || null,
          lastRunId: syncState.data()?.lastRunId || null,
          normalizerVersion: 1,
        },
      }, {merge: true});
    });
    await batch.commit();
  }

  await db.collection('public_sources').doc('safe182_missing_persons').set({
    title: '안전Dream 실종아동등 공개 수색정보',
    agency: '경찰청',
    officialPageUrl: 'https://www.safe182.go.kr/',
    lastVerifiedAt: lastCheckedAt || serverTimestamp(),
    processing: ['공개 필드 정규화', '상태 동기화', '중복 fingerprint 비교'],
    published: true,
  }, {merge: true});

  process.stdout.write(`${JSON.stringify({...result, applied: candidates.length}, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
