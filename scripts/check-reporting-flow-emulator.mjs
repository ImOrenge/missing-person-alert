import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectStorageEmulator, getStorage as getClientStorage, ref, uploadBytes } from 'firebase/storage';

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions('firebase-admin/app');
const { getAuth: getAdminAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore');
const { getStorage: getAdminStorage } = requireFromFunctions('firebase-admin/storage');
const sharp = requireFromFunctions('sharp');
const {migrateLegacyReports, rollbackLegacyMigration, legacyDestinationId} = requireFromFunctions('./lib/reports/legacy-migration.js');
const {buildNotificationContent, materializeNotificationEvent} = requireFromFunctions('./lib/notifications/dispatcher.js');
const {purgeExpiredReports} = requireFromFunctions('./lib/reports/retention.js');
const {consumeReportingRateLimit} = requireFromFunctions('./lib/reports/rate-limit.js');

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'demo-missingalert';
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const [storageHost, storagePort = '9199'] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
const baseUrl = `http://${functionsHost}/${projectId}/asia-northeast3/api`;
const adminApp = initializeAdminApp({ projectId }, `reporting-flow-${Date.now()}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getFirestore(adminApp);

const forbiddenPublicKeys = new Set([
  'exactLocation', 'rawText', 'ownerUid', 'contact', 'phone', 'email',
  'ciphertext', 'iv', 'tag', 'wrappedKey',
]);

const assertNoForbiddenKeys = (value, path = '$') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenPublicKeys.has(key), false, `forbidden public key ${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
};

const haversineMeters = (a, b) => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const requestJson = async (path, { token, ...init } = {}) => {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const createAuthenticatedClient = async (label, claims = {}) => {
  const uid = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await adminAuth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true });
  if (Object.keys(claims).length > 0) await adminAuth.setCustomUserClaims(uid, claims);
  const customToken = await adminAuth.createCustomToken(uid);
  const app = initializeClientApp({
    projectId,
    apiKey: 'demo-key',
    storageBucket: `${projectId}.appspot.com`,
  }, `${label}-${Date.now()}`);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const credential = await signInWithCustomToken(auth, customToken);
  const storage = getClientStorage(app);
  connectStorageEmulator(storage, storageHost, Number(storagePort));
  return { uid, token: await credential.user.getIdToken(true), app, storage };
};

const waitFor = async (probe, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('EMULATOR_WAIT_TIMEOUT');
};

let owner;
let reviewer;
let secondUser;
let legacyAdmin;
let agencyOnly;
let privacyOnly;

try {
  await adminDb.collection('runtimeConfig').doc('reporting').set({
    flags: {
      emergency_banner_v2_enabled: true,
      dashboard_v2_enabled: true,
      mobile_nav_v2_enabled: true,
      unified_search_enabled: true,
      unified_explorer_enabled: true,
      case_detail_v2_enabled: true,
      reporting_flow_v2_enabled: true,
      dashboard_personalization_enabled: true,
      admin_banner_v2_enabled: true,
      reports_submission_enabled: true,
      reports_media_enabled: true,
      reports_admin_enabled: true,
      reports_public_timeline_enabled: true,
      reports_map_layer_enabled: true,
      reports_notifications_enabled: true,
      reports_public_indexing_enabled: true,
    },
  });
  await adminDb.collection('missingPersons').doc('case-flow-1').set({
    name: '김○○',
    age: 17,
    gender: 'male',
    source: 'api',
    status: 'active',
    seoVisible: true,
    location: { address: '서울 중구' },
    missingDate: '2026-08-21',
    updatedAt: Timestamp.now(),
  });

  const rateNow = Timestamp.now();
  assert.equal((await consumeReportingRateLimit(adminDb, 'rate-user', {max: 2, windowMs: 60_000, now: rateNow})).allowed, true);
  assert.equal((await consumeReportingRateLimit(adminDb, 'rate-user', {max: 2, windowMs: 60_000, now: rateNow})).allowed, true);
  const limited = await consumeReportingRateLimit(adminDb, 'rate-user', {max: 2, windowMs: 60_000, now: rateNow});
  assert.equal(limited.allowed, false, 'distributed reporting rate limit must enforce the window transactionally');

  const migrationRunId = `emulator-backfill-${Date.now()}`;
  await adminDb.collection('missing_persons').doc('legacy-emulator-1').set({
    name: '레거시 이관 대상', age: 30, description: '관리자 연결과 사건 연결이 필요한 레거시 제보입니다.',
    location: {address: '서울 중구', lat: 37.57, lng: 126.99},
    reportedBy: {uid: 'legacy-owner-no-contact'}, createdAt: Timestamp.now(),
  });
  const migration = await migrateLegacyReports(adminDb, {runId: migrationRunId, mode: 'apply'});
  assert.equal(migration.created, 1);
  const rerun = await migrateLegacyReports(adminDb, {runId: migrationRunId, mode: 'verify'});
  assert.equal(rerun.unchanged, 1, 'backfill rerun must be idempotent');
  const migratedId = legacyDestinationId('legacy-emulator-1');
  assert.equal((await adminDb.collection('sightingReports').doc(migratedId).get()).data().migrationReviewRequired, true);
  const rollback = await rollbackLegacyMigration(adminDb, migrationRunId);
  assert.equal(rollback.rolledBack, 1);
  assert.equal((await adminDb.collection('sightingReports').doc(migratedId).get()).exists, false);

  await adminDb.collection('notificationSubscriptions').doc('notification-user-1').set({
    userId: 'notification-user-1', pushEnabled: true, caseIds: ['case-flow-1'], regionCodes: [], radius: null,
    quietHours: {enabled: false, start: '22:00', end: '07:00'}, channel: 'fcm', schemaVersion: 1,
  });
  await adminDb.collection('notificationEvents').doc('event-materialize-1').set({
    eventId: 'event-materialize-1', type: 'new_approved_report', caseId: 'case-flow-1',
    regionLabel: '서울 중구', status: 'pending', createdAt: Timestamp.now(),
  });
  const enqueuedDeliveries = [];
  const targetResult = await materializeNotificationEvent(adminDb, 'event-materialize-1', async (eventId, deliveryId) => enqueuedDeliveries.push({eventId, deliveryId}));
  assert.equal(targetResult.targeted, 1);
  assert.equal(enqueuedDeliveries.length, 1);
  const targetRerun = await materializeNotificationEvent(adminDb, 'event-materialize-1', async () => { throw new Error('duplicate delivery was re-enqueued'); });
  assert.equal(targetRerun.existing, 1, 'delivery materialization must be idempotent');

  await adminDb.collection('missingPersons').doc('case-close-flow').set({
    source: 'api', status: 'active', seoVisible: true, location: {address: '서울 중구'}, createdAt: Timestamp.now(),
  });
  await adminDb.collection('notificationSubscriptions').doc('notification-close-user').set({
    userId: 'notification-close-user', pushEnabled: true, caseIds: ['case-close-flow'], regionCodes: [], radius: null,
    quietHours: {enabled: false, start: '22:00', end: '07:00'}, channel: 'fcm', schemaVersion: 1,
  });
  await adminDb.collection('missingPersons').doc('case-close-flow').update({status: 'found'});
  const closureEvent = await waitFor(async () => {
    const snapshot = await adminDb.collection('notificationEvents').doc('case-closed-case-close-flow-found').get();
    return snapshot.exists ? snapshot : null;
  });
  assert.deepEqual(closureEvent.data().targetUserIds, ['notification-close-user']);
  const closedSubscription = await waitFor(async () => {
    const snapshot = await adminDb.collection('notificationSubscriptions').doc('notification-close-user').get();
    return snapshot.data()?.caseIds?.includes('case-close-flow') === false ? snapshot : null;
  });
  assert.deepEqual(closedSubscription.data().caseIds, []);
  const closureDeliveries = [];
  const closureTarget = await materializeNotificationEvent(adminDb, closureEvent.id, async (eventId, deliveryId) => closureDeliveries.push({eventId, deliveryId}));
  assert.equal(closureTarget.targeted, 1, 'case closure must notify the pre-removal recipient snapshot once');
  assert.equal(closureDeliveries.length, 1);

  owner = await createAuthenticatedClient('owner');
  reviewer = await createAuthenticatedClient('reviewer', { reportModerator: true, seniorModerator: true, agencyOperator: true });
  secondUser = await createAuthenticatedClient('second-user');
  legacyAdmin = await createAuthenticatedClient('legacy-admin', { admin: true });
  agencyOnly = await createAuthenticatedClient('agency-only', { agencyOperator: true });
  privacyOnly = await createAuthenticatedClient('privacy-only', { privacyOfficer: true });

  const legacySubmission = await requestJson('/api/reports', {
    token: owner.token,
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({person: {name: '구형 경로', age: 20, location: {address: '서울', lat: 37.5, lng: 127}}}),
  });
  assert.equal(legacySubmission.response.status, 410);
  assert.equal(legacySubmission.body.error, 'LEGACY_REPORTING_RETIRED');

  const config = await requestJson('/api/config/ui');
  assert.equal(config.response.status, 200);
  assert.equal(config.body.flags.reporting_flow_v2_enabled, true);

  const mediaId = '0123456789abcdef0123456789abcdef';
  const draftId = 'flow-check-request-0001';
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 80, b: 140 } },
  }).jpeg().toBuffer();
  await uploadBytes(
    ref(owner.storage, `report-private/${owner.uid}/drafts/${draftId}/${mediaId}`),
    jpeg,
    { contentType: 'image/jpeg', cacheControl: 'private,max-age=0,no-store' }
  );
  const mediaSnapshot = await waitFor(async () => {
    const snapshot = await adminDb.collection('reportMediaDrafts').doc(draftId).collection('media').doc(mediaId).get();
    return snapshot.exists ? snapshot : null;
  });
  assert.equal(mediaSnapshot.data().scanStatus, 'normalized');
  assert.equal(mediaSnapshot.data().manualMaskConfirmed, false);
  const ownerMediaStatus = await requestJson(`/api/v2/report-media/drafts/${draftId}?mediaIds=${mediaId}`, { token: owner.token });
  assert.equal(ownerMediaStatus.response.status, 200);
  assert.equal(ownerMediaStatus.body.ready, true);
  const crossAccountMediaStatus = await requestJson(`/api/v2/report-media/drafts/${draftId}?mediaIds=${mediaId}`, { token: secondUser.token });
  assert.equal(crossAccountMediaStatus.response.status, 200);
  assert.equal(crossAccountMediaStatus.body.ready, false);

  const fullPublicDescription = `${'서울 중구 인근에서 확인한 이동 경로와 인상착의 상세입니다. '.repeat(16)}마지막 확인 문장입니다.`;
  assert.ok(fullPublicDescription.length > 500);
  const reportInput = {
    clientRequestId: draftId,
    caseId: 'case-flow-1',
    reportType: 'sighting',
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    location: { address: '서울 중구 세종대로 110 인근', lat: 37.5665, lng: 126.9780 },
    description: fullPublicDescription,
    mediaIds: [mediaId],
    consent: { processing: true, accuracy: true, sensitiveLocation: true },
  };
  const submit = await requestJson('/api/v2/reports', {
    token: owner.token,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-recaptcha-action': 'report_submit' },
    body: JSON.stringify(reportInput),
  });
  assert.equal(submit.response.status, 201);
  assert.equal(submit.body.success, true);
  assertNoForbiddenKeys(submit.body);
  const reportId = submit.body.reportId;

  const duplicateSubmit = await requestJson('/api/v2/reports', {
    token: owner.token,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-recaptcha-action': 'report_submit' },
    body: JSON.stringify(reportInput),
  });
  assert.equal(duplicateSubmit.response.status, 201);
  assert.equal(duplicateSubmit.body.reportId, reportId);

  const ownerDetail = await requestJson(`/api/v2/reports/${reportId}`, { token: owner.token });
  assert.equal(ownerDetail.response.status, 200);
  assert.equal(ownerDetail.body.report.reportId, reportId);
  assert.equal(ownerDetail.body.report.description, reportInput.description);
  assert.equal(ownerDetail.body.report.locationLabel, reportInput.location.address);
  assert.equal(ownerDetail.body.report.mediaCount, 1);
  assert.equal('ownerUid' in ownerDetail.body.report, false);
  assert.equal('exactLocation' in ownerDetail.body.report, false);
  assert.match(ownerDetail.response.headers.get('cache-control') || '', /no-store/);
  assert.match(ownerDetail.response.headers.get('vary') || '', /authorization/i);

  const crossAccount = await requestJson(`/api/v2/reports/${reportId}`, { token: secondUser.token });
  assert.equal(crossAccount.response.status, 403);

  const queue = await requestJson('/api/v2/admin/reports?status=submitted', { token: reviewer.token });
  assert.equal(queue.response.status, 200);
  assert.equal(queue.body.reports.some((report) => report.reportId === reportId), true);
  assertNoForbiddenKeys(queue.body);
  const legacyAdminQueue = await requestJson('/api/v2/admin/reports?status=submitted', {token: legacyAdmin.token});
  assert.equal(legacyAdminQueue.response.status, 403, 'legacy admin claim must not authorize reporting moderation');

  const detail = await requestJson(`/api/v2/admin/reports/${reportId}`, {
    token: reviewer.token,
    headers: { 'x-access-purpose': 'moderation_review' },
  });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.report.exactLocation.lat, reportInput.location.lat);
  assert.match(detail.response.headers.get('cache-control') || '', /no-store/);
  assert.match(detail.response.headers.get('vary') || '', /authorization/i);

  for (const client of [agencyOnly, privacyOnly]) {
    const forbiddenReview = await requestJson(`/api/v2/admin/reports/${reportId}/start-review`, {
      token: client.token,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(forbiddenReview.response.status, 403, 'agency/privacy roles must not perform moderation review actions');
  }

  const mediaApproval = await requestJson(`/api/v2/admin/reports/${reportId}/media/${mediaId}/approve`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 1, reviewNote: '제3자 얼굴과 민감정보가 없고 EXIF 제거를 확인했습니다.' }),
  });
  assert.equal(mediaApproval.response.status, 200);
  assert.equal(mediaApproval.body.version, 2);

  const informationRequest = await requestJson(`/api/v2/admin/reports/${reportId}/needs-information`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 2, requestMessage: '목격 당시 이동 방향과 주변 표식을 추가로 알려주세요.' }),
  });
  assert.equal(informationRequest.response.status, 200);

  const requestedOwnReports = await requestJson('/api/v2/reports/my', { token: owner.token });
  const requestedReport = requestedOwnReports.body.reports.find((report) => report.reportId === reportId);
  assert.equal(requestedReport.needsInformation, true);
  assert.equal(requestedReport.version, 3);
  assert.match(requestedReport.informationRequestMessage, /이동 방향/);

  const forbiddenAdditionalInformation = await requestJson(`/api/v2/reports/${reportId}/additional-information`, {
    token: secondUser.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 3, message: '다른 사용자는 이 정보를 추가할 수 없어야 합니다.' }),
  });
  assert.equal(forbiddenAdditionalInformation.response.status, 403);

  const additionalInformation = await requestJson(`/api/v2/reports/${reportId}/additional-information`, {
    token: owner.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 3, message: '시청 방향으로 이동했으며 파란색 안내판 옆을 지나갔습니다.' }),
  });
  assert.equal(additionalInformation.response.status, 200);
  assert.equal(additionalInformation.body.version, 4);
  const detailWithAdditionalInformation = await requestJson(`/api/v2/admin/reports/${reportId}`, {
    token: reviewer.token,
    headers: { 'x-access-purpose': 'moderation_review' },
  });
  assert.equal(detailWithAdditionalInformation.response.status, 200);
  assert.match(detailWithAdditionalInformation.body.report.additionalInformation[0].message, /시청 방향/);

  const approvalInput = {
    expectedVersion: 4,
    publicRadiusM: 500,
    approvedMediaIds: [mediaId],
  };
  const approval = await requestJson(`/api/v2/admin/reports/${reportId}/approve`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(approvalInput),
  });
  assert.equal(approval.response.status, 200);
  assert.equal(approval.body.publicationRevision, 5);

  const publicReportSnapshot = await adminDb.collection('publicReports').doc(reportId).get();
  const publicReport = publicReportSnapshot.data();
  assert.equal(publicReport.publicDescription, fullPublicDescription);
  assert.equal(publicReport.publicLocationText, reportInput.location.address);
  assert.equal(typeof publicReport.publicGeohash, 'string');
  assert.notDeepEqual(publicReport.publicLocation, reportInput.location);
  const publicOffsetM = haversineMeters(reportInput.location, publicReport.publicLocation);
  assert.equal(publicOffsetM >= 300 && publicOffsetM <= 500, true, `public offset ${publicOffsetM}m must honor privacy radius`);
  assert.equal(publicReport.media.length, 1);
  const publicMediaPath = `report-public/${reportId}/${mediaId}/5.webp`;
  assert.equal((await getAdminStorage(adminApp).bucket(`${projectId}.appspot.com`).file(publicMediaPath).exists())[0], true);

  const staleApproval = await requestJson(`/api/v2/admin/reports/${reportId}/approve`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(approvalInput),
  });
  assert.equal(staleApproval.response.status, 409);
  assert.equal(staleApproval.body.error, 'REVIEW_CONFLICT');

  const forwarding = await requestJson(`/api/v2/admin/reports/${reportId}/forward`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({expectedVersion: 5, agencyName: '서울중부경찰서', channel: 'official_system', externalReceiptNumber: 'FLOW-RECEIPT-1', outcome: '공식 시스템으로 안전하게 전달 완료'}),
  });
  assert.equal(forwarding.response.status, 200);
  assert.equal(forwarding.body.version, 6);

  const confirmation = await requestJson(`/api/v2/admin/reports/${reportId}/confirm`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({expectedVersion: 6, confirmationReference: 'FLOW-CONFIRM-1'}),
  });
  assert.equal(confirmation.response.status, 200);
  assert.equal(confirmation.body.version, 7);

  const explore = await requestJson('/api/v2/explore/reports?west=124&south=33&east=132&north=39.5&zoom=7');
  assert.equal(explore.response.status, 200);
  const exploredReport = explore.body.items.find((item) => item.id === reportId);
  assert.equal(exploredReport?.publicDescription, fullPublicDescription);
  assert.equal(exploredReport?.publicLocationText, reportInput.location.address);
  assertNoForbiddenKeys(explore.body);

  const reportSearch = await requestJson('/api/search/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: '중구', tab: 'reports', limit: 30 }),
  });
  assert.equal(reportSearch.response.status, 200);
  assert.equal(typeof reportSearch.body.requestId, 'string');
  assert.equal(reportSearch.body.items.some((item) => item.id === reportId), true);
  assertNoForbiddenKeys(reportSearch.body);

  const standaloneDraftId = `standalone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const standaloneInput = {
    clientRequestId: standaloneDraftId,
    reportType: 'new_case_lead',
    occurredAt: new Date(Date.now() - 120_000).toISOString(),
    location: {address: '서울특별시 종로구 독립 공개 검증 위치', lat: 37.573, lng: 126.9794},
    description: '독립공개검증 사건 연결 전에도 시민이 제출한 전체 제보와 위치를 공개할 수 있어야 합니다.',
    mediaIds: [],
    consent: {processing: true, accuracy: true, sensitiveLocation: true},
  };
  const standaloneSubmit = await requestJson('/api/v2/reports', {
    token: owner.token,
    method: 'POST',
    headers: {'content-type': 'application/json', 'x-recaptcha-action': 'report_submit'},
    body: JSON.stringify(standaloneInput),
  });
  assert.equal(standaloneSubmit.response.status, 201);
  const standaloneReportId = standaloneSubmit.body.reportId;
  await adminDb.collection('sightingReports').doc(standaloneReportId).update({
    migrationReviewRequired: true,
    migrationReviewReasons: ['case_link_required'],
  });
  await adminDb.collection('migrationQuarantine').doc(standaloneReportId).set({
    status: 'pending_review',
    reasons: ['case_link_required'],
    destinationId: standaloneReportId,
    createdAt: Timestamp.now(),
  });
  const standaloneApproval = await requestJson(`/api/v2/admin/reports/${standaloneReportId}/approve`, {
    token: reviewer.token,
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({expectedVersion: 1, publicRadiusM: 500, approvedMediaIds: []}),
  });
  assert.equal(standaloneApproval.response.status, 200);
  const standalonePublic = (await adminDb.collection('publicReports').doc(standaloneReportId).get()).data();
  assert.equal(standalonePublic.caseId, null);
  assert.equal(standalonePublic.publicDescription, standaloneInput.description);
  assert.equal(standalonePublic.publicLocationText, standaloneInput.location.address);
  const resolvedStandalonePrivate = (await adminDb.collection('sightingReports').doc(standaloneReportId).get()).data();
  assert.equal(resolvedStandalonePrivate.migrationReviewRequired, undefined);
  assert.equal(resolvedStandalonePrivate.migrationReviewReasons, undefined);
  const resolvedStandaloneQuarantine = (await adminDb.collection('migrationQuarantine').doc(standaloneReportId).get()).data();
  assert.equal(resolvedStandaloneQuarantine.status, 'resolved');
  assert.equal(resolvedStandaloneQuarantine.resolution, 'approved_public');
  const standaloneExpiryDays = (standalonePublic.expiresAt.toMillis() - Date.now()) / (24 * 60 * 60_000);
  assert.equal(standaloneExpiryDays > 89 && standaloneExpiryDays <= 90, true, 'standalone public report must expire after the 90-day review window');

  const standaloneExplore = await requestJson('/api/v2/explore/reports?west=124&south=33&east=132&north=39.5&zoom=7');
  const standaloneExploreItem = standaloneExplore.body.items.find((item) => item.id === standaloneReportId);
  assert.equal(standaloneExploreItem?.href, `/map?publicReportId=${standaloneReportId}`);
  const standaloneSearch = await requestJson('/api/search/query', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({q: '독립공개검증', tab: 'reports', limit: 30}),
  });
  const standaloneSearchItem = standaloneSearch.body.items.find((item) => item.id === standaloneReportId);
  assert.equal(standaloneSearchItem?.href, `/map?publicReportId=${standaloneReportId}`);
  assert.equal(buildNotificationContent({type: 'new_approved_report', reportId: standaloneReportId, regionLabel: standaloneInput.location.address}).link, `/map?publicReportId=${standaloneReportId}`);

  const ownReports = await requestJson('/api/v2/reports/my', { token: owner.token });
  assert.equal(ownReports.response.status, 200);
  assert.equal(ownReports.body.reports.find((report) => report.reportId === reportId)?.displayStatus, '확인된 제보');
  assertNoForbiddenKeys(ownReports.body);

  const unpublish = await requestJson(`/api/v2/admin/reports/${reportId}/unpublish`, {
    token: reviewer.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion: 7, reason: '사건 검토 결과 공개 취소가 필요합니다.' }),
  });
  assert.equal(unpublish.response.status, 200);
  assert.equal(unpublish.body.status, 'triage');
  assert.equal(unpublish.body.version, 8);

  const afterUnpublish = await requestJson('/api/v2/explore/reports?west=124&south=33&east=132&north=39.5&zoom=7');
  assert.equal(afterUnpublish.body.items.some((item) => item.id === reportId), false);
  assert.equal((await adminDb.collection('publicReports').doc(reportId).get()).exists, false);
  assert.equal((await getAdminStorage(adminApp).bucket(`${projectId}.appspot.com`).file(publicMediaPath).exists())[0], false);
  assert.equal((await adminDb.collection('sightingReports').doc(reportId).collection('statusHistory').get()).size >= 2, true);
  assert.equal((await adminDb.collection('privacyAuditLogs').where('reportId', '==', reportId).get()).size >= 1, true);

  const forbiddenContact = await requestJson(`/api/v2/admin/reports/${reportId}/contact`, {
    token: secondUser.token,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({purpose: 'agency_callback'}),
  });
  assert.equal(forbiddenContact.response.status, 403);

  const submitWorkflowReport = async (suffix, description) => {
    const created = await requestJson('/api/v2/reports', {
      token: owner.token,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-recaptcha-action': 'report_submit' },
      body: JSON.stringify({...reportInput, clientRequestId: `flow-check-${suffix}-0001`, description, mediaIds: []}),
    });
    assert.equal(created.response.status, 201);
    return created.body.reportId;
  };
  const duplicateReportId = await submitWorkflowReport('duplicate', '동일 시간대와 장소의 기존 제보와 중복되는 목격 내용입니다.');
  const duplicate = await requestJson(`/api/v2/admin/reports/${duplicateReportId}/duplicate`, {
    token: reviewer.token, method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({expectedVersion: 1, primaryReportId: reportId, reason: '동일 시각과 위치의 기존 제보로 안전하게 통합합니다.'}),
  });
  assert.equal(duplicate.response.status, 200);
  const archiveDuplicate = await requestJson(`/api/v2/admin/reports/${duplicateReportId}/archive`, {
    token: reviewer.token, method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({expectedVersion: 2, reason: '중복 제보 통합 처리가 완료되어 보존 단계로 전환합니다.'}),
  });
  assert.equal(archiveDuplicate.response.status, 200);

  const rejectedReportId = await submitWorkflowReport('rejected', '검토 결과 공개할 수 없는 별도의 테스트 목격 제보 내용입니다.');
  const rejection = await requestJson(`/api/v2/admin/reports/${rejectedReportId}/reject`, {
    token: reviewer.token, method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({expectedVersion: 1, reason: '공식 사건과 일치하지 않아 공개할 수 없는 제보입니다.'}),
  });
  assert.equal(rejection.response.status, 200);
  const archiveRejected = await requestJson(`/api/v2/admin/reports/${rejectedReportId}/archive`, {
    token: reviewer.token, method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({expectedVersion: 2, reason: '반려 검토가 완료되어 보존 및 파기 일정으로 전환합니다.'}),
  });
  assert.equal(archiveRejected.response.status, 200);

  const retentionReportRef = adminDb.collection('sightingReports').doc('retention-flow-1');
  await retentionReportRef.set({
    reportId: 'retention-flow-1', receiptNumber: 'MA-RETENTION-1', ownerUid: owner.uid,
    exactLocation: reportInput.location, rawText: '보존기간 만료 후 제거할 민감한 원문', mediaIds: [],
    status: 'rejected', visibility: 'private', version: 2, purgeAfter: Timestamp.fromMillis(Date.now() - 60_000),
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
  await retentionReportRef.collection('private').doc('contact').set({ciphertext: 'encrypted-only'});
  await retentionReportRef.collection('additionalInformation').doc('response-1').set({message: '파기해야 하는 추가 민감정보', createdAt: Timestamp.now()});
  await retentionReportRef.collection('statusHistory').doc('history-1').set({from: 'submitted', to: 'rejected', createdAt: Timestamp.now()});
  await retentionReportRef.collection('moderationActions').doc('action-1').set({action: 'forwarded', externalReceiptNumber: 'SECRET-RECEIPT-1', createdAt: Timestamp.now()});
  const retentionResult = await purgeExpiredReports(adminDb, Timestamp.now());
  assert.equal(retentionResult.purged >= 1, true);
  const purgedReport = (await retentionReportRef.get()).data();
  assert.equal(purgedReport.ownerUid, undefined);
  assert.equal(purgedReport.exactLocation, undefined);
  assert.equal(purgedReport.rawText, undefined);
  assert.equal(purgedReport.sensitiveDataAvailable, false);
  assert.equal((await retentionReportRef.collection('private').doc('contact').get()).exists, false);
  assert.equal((await retentionReportRef.collection('additionalInformation').doc('response-1').get()).exists, false);
  assert.equal((await retentionReportRef.collection('statusHistory').doc('history-1').get()).exists, true);
  const redactedAction = (await retentionReportRef.collection('moderationActions').doc('action-1').get()).data();
  assert.equal(redactedAction.externalReceiptNumber, undefined);
  assert.equal(typeof redactedAction.sensitiveReferenceHash, 'string');

  console.log('Reporting submit, migration, notification targeting, owner follow-up, moderation, privacy projection, search, unpublish, and retention checks passed');
} finally {
  for (const client of [owner, reviewer, secondUser, legacyAdmin, agencyOnly, privacyOnly]) {
    if (client?.app) await deleteClientApp(client.app).catch(() => undefined);
  }
  await deleteAdminApp(adminApp).catch(() => undefined);
}
