import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'missing-person-alram';
const baseUrl = 'https://missingalert.kr';
const artifactPath = path.join(repoRoot, 'artifacts', 'reporting-refactor', 'production-authenticated-reporting-smoke.json');

const firebaseConfigSource = await readFile(path.join(repoRoot, 'frontend', 'src', 'services', 'firebaseConfig.ts'), 'utf8');
const apiKey = firebaseConfigSource.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY_NOT_FOUND');

const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], { encoding: 'utf8' })
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }))
  .trim();
if (!oauthToken) throw new Error('GCLOUD_ACCESS_TOKEN_NOT_AVAILABLE');

const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const reportId = `prod-smoke-${runId}`;
const syntheticPassword = `Ma!${randomBytes(18).toString('base64url')}`;
const ownerEmail = `missingalert-owner-${runId}@example.com`;
const moderatorEmail = `missingalert-moderator-${runId}@example.com`;
const createdUsers = [];
const cleanupErrors = [];
const checks = [];

const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const record = (name, passed, detail) => {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`CHECK_FAILED:${name}`);
};

const requestJson = async (url, options, label, expectedStatuses = [200]) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!expectedStatuses.includes(response.status)) {
    const errorCode = typeof body?.error === 'string'
      ? body.error
      : typeof body?.error?.message === 'string'
        ? body.error.message
        : 'UNKNOWN_ERROR';
    throw new Error(`${label}:${response.status}:${errorCode.slice(0, 120)}`);
  }
  return { status: response.status, body };
};

const oauthHeaders = { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId };
const identityAdminUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
const identityClientUrl = 'https://identitytoolkit.googleapis.com/v1/accounts';
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const createUser = async (email, displayName) => {
  const { body } = await requestJson(
    `${identityAdminUrl}/accounts?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', headers: oauthHeaders, body: JSON.stringify({ email, password: syntheticPassword, emailVerified: true, displayName }) },
    'CREATE_TEST_USER',
  );
  if (!body.localId) throw new Error('CREATE_TEST_USER:NO_LOCAL_ID');
  createdUsers.push(body.localId);
  return body.localId;
};

const setClaims = async (localId, claims) => {
  await requestJson(
    `${identityAdminUrl}/accounts:update`,
    { method: 'POST', headers: oauthHeaders, body: JSON.stringify({ localId, customAttributes: JSON.stringify(claims) }) },
    'SET_TEST_CLAIMS',
  );
};

const signIn = async (email) => {
  const { body } = await requestJson(
    `${identityClientUrl}:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: syntheticPassword, returnSecureToken: true }) },
    'SIGN_IN_TEST_USER',
  );
  if (!body.idToken) throw new Error('SIGN_IN_TEST_USER:NO_ID_TOKEN');
  return body.idToken;
};

const stringValue = (value) => ({ stringValue: value });
const integerValue = (value) => ({ integerValue: String(value) });
const timestampValue = (value) => ({ timestampValue: value });
const mapValue = (fields) => ({ mapValue: { fields } });
const arrayValue = (values = []) => ({ arrayValue: { values } });

const createSyntheticReport = async (ownerUid) => {
  const now = new Date().toISOString();
  const fields = {
    reportId: stringValue(reportId),
    receiptNumber: stringValue(`MA-SMOKE-${fingerprint(runId).toUpperCase()}`),
    ownerUid: stringValue(ownerUid),
    reportType: stringValue('new_case_lead'),
    occurredAt: stringValue(now),
    exactLocation: mapValue({ address: stringValue('서울특별시 운영 리허설 구역'), lat: { doubleValue: 37.5665 }, lng: { doubleValue: 126.978 } }),
    rawText: stringValue('자동화된 운영 리허설을 위한 합성 제보입니다. 실제 인물이나 사건 정보가 아닙니다.'),
    mediaIds: arrayValue(),
    mediaDraftId: stringValue(`smoke-draft-${runId}`),
    consent: mapValue({ processing: { booleanValue: true }, accuracy: { booleanValue: true }, sensitiveLocation: { booleanValue: true } }),
    status: stringValue('submitted'),
    visibility: stringValue('private'),
    version: integerValue(1),
    createdAt: timestampValue(now),
    updatedAt: timestampValue(now),
  };
  await requestJson(
    `${firestoreBase}/sightingReports?documentId=${encodeURIComponent(reportId)}`,
    { method: 'POST', headers: oauthHeaders, body: JSON.stringify({ fields }) },
    'CREATE_SYNTHETIC_REPORT',
    [200],
  );
};

const apiRequest = async (pathName, token, options = {}, expectedStatuses = [200]) => requestJson(
  `${baseUrl}${pathName}`,
  { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } },
  `API_${pathName}`,
  expectedStatuses,
);

const listDocuments = async (collectionPath) => {
  const { body } = await requestJson(
    `${firestoreBase}/${collectionPath}?pageSize=100`,
    { method: 'GET', headers: oauthHeaders },
    `LIST_${collectionPath}`,
  );
  return Array.isArray(body.documents) ? body.documents : [];
};

const deleteDocumentName = async (name) => {
  await requestJson(
    `https://firestore.googleapis.com/v1/${name}`,
    { method: 'DELETE', headers: oauthHeaders },
    'DELETE_FIRESTORE_DOCUMENT',
    [200],
  );
};

const queryDocumentsByReportId = async (collectionId) => {
  const { body } = await requestJson(
    `${firestoreBase}:runQuery`,
    {
      method: 'POST',
      headers: oauthHeaders,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: 'reportId' }, op: 'EQUAL', value: stringValue(reportId) } },
          limit: 100,
        },
      }),
    },
    `QUERY_${collectionId}`,
  );
  return Array.isArray(body) ? body.map((item) => item.document).filter(Boolean) : [];
};

const cleanup = async () => {
  for (const subcollection of ['statusHistory', 'moderationActions', 'additionalInformation', 'private']) {
    try {
      const documents = await listDocuments(`sightingReports/${reportId}/${subcollection}`);
      for (const document of documents) await deleteDocumentName(document.name);
    } catch (error) {
      cleanupErrors.push(`${subcollection}:${error.message}`);
    }
  }
  try {
    await requestJson(
      `${firestoreBase}/sightingReports/${encodeURIComponent(reportId)}`,
      { method: 'DELETE', headers: oauthHeaders },
      'DELETE_SYNTHETIC_REPORT',
      [200],
    );
  } catch (error) {
    cleanupErrors.push(`report:${error.message}`);
  }
  try {
    const auditDocuments = await queryDocumentsByReportId('privacyAuditLogs');
    for (const document of auditDocuments) await deleteDocumentName(document.name);
  } catch (error) {
    cleanupErrors.push(`privacyAuditLogs:${error.message}`);
  }
  for (const localId of createdUsers.reverse()) {
    try {
      await requestJson(
        `${identityAdminUrl}/accounts:delete`,
        { method: 'POST', headers: oauthHeaders, body: JSON.stringify({ localId }) },
        'DELETE_TEST_USER',
      );
    } catch (error) {
      cleanupErrors.push(`user-${fingerprint(localId)}:${error.message}`);
    }
  }
};

let outcome = 'failed';
let failure = null;
try {
  const ownerUid = await createUser(ownerEmail, 'MissingAlert smoke owner');
  const moderatorUid = await createUser(moderatorEmail, 'MissingAlert smoke moderator');
  await setClaims(moderatorUid, { reportModerator: true });
  const ownerToken = await signIn(ownerEmail);
  const moderatorToken = await signIn(moderatorEmail);
  await createSyntheticReport(ownerUid);

  const ownerList = await apiRequest('/api/v2/reports/my', ownerToken);
  record('owner_can_list_own_report', ownerList.body.reports?.some((item) => item.reportId === reportId) === true, `status=${ownerList.status}`);

  const forbiddenAdminList = await apiRequest('/api/v2/admin/reports?status=submitted', ownerToken, {}, [403]);
  record('owner_cannot_read_admin_queue', forbiddenAdminList.status === 403 && forbiddenAdminList.body.error === 'ADMIN_ROLE_REQUIRED', `status=${forbiddenAdminList.status}`);

  const adminList = await apiRequest('/api/v2/admin/reports?status=submitted', moderatorToken);
  record('moderator_can_read_submitted_queue', adminList.body.reports?.some((item) => item.reportId === reportId) === true, `status=${adminList.status}`);

  const detail = await apiRequest(`/api/v2/admin/reports/${reportId}`, moderatorToken, { headers: { 'x-access-purpose': 'moderation_review' } });
  record('moderator_detail_requires_and_accepts_purpose', detail.body.report?.reportId === reportId, `status=${detail.status}`);

  const startReview = await apiRequest(`/api/v2/admin/reports/${reportId}/start-review`, moderatorToken, { method: 'POST', body: JSON.stringify({ expectedVersion: 1 }) });
  record('moderator_can_start_review', startReview.body.status === 'triage' && startReview.body.version === 2, `status=${startReview.status},version=${startReview.body.version}`);

  const ownerAfterReview = await apiRequest('/api/v2/reports/my', ownerToken);
  const reviewedItem = ownerAfterReview.body.reports?.find((item) => item.reportId === reportId);
  record('owner_sees_review_state', reviewedItem?.displayStatus === '검토 중' && reviewedItem?.version === 2, `status=${ownerAfterReview.status},version=${reviewedItem?.version}`);

  const reject = await apiRequest(`/api/v2/admin/reports/${reportId}/reject`, moderatorToken, { method: 'POST', body: JSON.stringify({ expectedVersion: 2, reason: '운영 리허설 합성 데이터 정리 처리입니다.' }) });
  record('moderator_can_close_synthetic_report', reject.body.status === 'rejected' && reject.body.version === 3, `status=${reject.status},version=${reject.body.version}`);

  outcome = 'passed';
} catch (error) {
  failure = error instanceof Error ? error.message : 'UNKNOWN_FAILURE';
} finally {
  await cleanup();
}

const evidence = {
  schemaVersion: 1,
  projectId,
  baseUrl,
  executedAt: new Date().toISOString(),
  outcome: outcome === 'passed' && cleanupErrors.length === 0 ? 'passed' : outcome === 'passed' ? 'passed_with_cleanup_errors' : 'failed',
  runFingerprint: fingerprint(runId),
  syntheticOnly: true,
  submissionEndpointTested: false,
  submissionEndpointReason: 'Production reCAPTCHA is intentionally not bypassed.',
  checks,
  cleanup: { attempted: true, errors: cleanupErrors },
  failure,
};

await mkdir(path.dirname(artifactPath), { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outcome: evidence.outcome, checks: checks.length, cleanupErrors: cleanupErrors.length, artifact: path.relative(repoRoot, artifactPath) }));
if (evidence.outcome !== 'passed') process.exitCode = 1;
