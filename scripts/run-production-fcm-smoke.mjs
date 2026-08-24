import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'missing-person-alram';
const readOnly = process.argv.includes('--read-only');
const artifactPath = path.join(
  repoRoot,
  'artifacts',
  'reporting-refactor',
  readOnly ? 'production-fcm-readiness.json' : 'production-fcm-delivery-smoke.json',
);
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], { encoding: 'utf8' })
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }))
  .trim();
const headers = { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId };

const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
const valueOf = (field) => field?.stringValue ?? field?.integerValue ?? field?.booleanValue ?? field?.timestampValue ?? null;

const requestJson = async (url, options, label, expectedStatuses = [200]) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!expectedStatuses.includes(response.status)) {
    const code = typeof body?.error?.message === 'string' ? body.error.message : typeof body?.error === 'string' ? body.error : 'UNKNOWN_ERROR';
    throw new Error(`${label}:${response.status}:${code.slice(0, 100)}`);
  }
  return body;
};

const runQuery = async (structuredQuery) => requestJson(
  `${firestoreBase}:runQuery`,
  { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) },
  'FIRESTORE_QUERY',
);

const getDocument = async (documentPath) => requestJson(
  `${firestoreBase}/${documentPath}`,
  { method: 'GET', headers },
  'FIRESTORE_GET',
  [200, 404],
);

const listDocuments = async (collectionPath) => requestJson(
  `${firestoreBase}/${collectionPath}?pageSize=20`,
  { method: 'GET', headers },
  'FIRESTORE_LIST',
);

const findReadyRecipient = async () => {
  const subscriptionResults = await runQuery({
    from: [{ collectionId: 'notificationSubscriptions' }],
    where: { fieldFilter: { field: { fieldPath: 'pushEnabled' }, op: 'EQUAL', value: { booleanValue: true } } },
    limit: 100,
  });
  for (const result of subscriptionResults) {
    const document = result.document;
    if (!document?.name) continue;
    const userId = document.name.split('/').pop();
    const tokenDocument = await getDocument(`userTokens/${encodeURIComponent(userId)}`);
    const tokenFields = tokenDocument?.fields?.tokens?.mapValue?.fields || {};
    const tokenCount = Object.values(tokenFields).filter((entry) => typeof entry?.mapValue?.fields?.token?.stringValue === 'string').length;
    if (tokenCount > 0) return { userId, tokenCount };
  }
  return null;
};

const evidence = {
  schemaVersion: 1,
  projectId,
  executedAt: new Date().toISOString(),
  outcome: 'not_ready',
  reason: 'NO_PUSH_ENABLED_SUBSCRIPTION_WITH_ACTIVE_TOKEN',
  eventId: null,
  recipientHash: null,
  tokenCount: 0,
  eventStatus: null,
  targetedCount: null,
  delivery: null,
  userReceiptConfirmed: false,
};

const recipient = await findReadyRecipient();
if (recipient && readOnly) {
  evidence.outcome = 'ready';
  evidence.reason = null;
  evidence.recipientHash = fingerprint(recipient.userId);
  evidence.tokenCount = recipient.tokenCount;
} else if (recipient) {
  const eventId = `notification-test-${Date.now()}`;
  const now = new Date().toISOString();
  evidence.eventId = eventId;
  evidence.recipientHash = fingerprint(recipient.userId);
  evidence.tokenCount = recipient.tokenCount;
  evidence.outcome = 'pending';
  evidence.reason = null;

  await requestJson(
    `${firestoreBase}/notificationEvents?documentId=${encodeURIComponent(eventId)}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields: {
        eventId: { stringValue: eventId },
        type: { stringValue: 'notification_test' },
        targetUserIds: { arrayValue: { values: [{ stringValue: recipient.userId }] } },
        status: { stringValue: 'pending' },
        createdAt: { timestampValue: now },
      } }),
    },
    'CREATE_NOTIFICATION_TEST_EVENT',
  );

  const deadline = Date.now() + 55_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const [eventDocument, deliveryDocuments] = await Promise.all([
      getDocument(`notificationEvents/${encodeURIComponent(eventId)}`),
      listDocuments(`notificationEvents/${encodeURIComponent(eventId)}/deliveries`),
    ]);
    evidence.eventStatus = valueOf(eventDocument?.fields?.status);
    evidence.targetedCount = Number(valueOf(eventDocument?.fields?.targetedCount) ?? 0);
    const deliveryDocument = deliveryDocuments?.documents?.[0];
    if (deliveryDocument?.fields) {
      evidence.delivery = {
        status: valueOf(deliveryDocument.fields.status),
        attempts: Number(valueOf(deliveryDocument.fields.attempts) ?? 0),
        successCount: Number(valueOf(deliveryDocument.fields.successCount) ?? 0),
        failureCount: Number(valueOf(deliveryDocument.fields.failureCount) ?? 0),
        lastErrorCode: valueOf(deliveryDocument.fields.lastErrorCode),
        sentAt: valueOf(deliveryDocument.fields.sentAt),
      };
      if (['sent', 'permanent_failed', 'suppressed'].includes(evidence.delivery.status)) break;
    }
  }
  evidence.outcome = evidence.delivery?.status === 'sent' ? 'backend_sent' : evidence.delivery?.status || 'timed_out';
}

await mkdir(path.dirname(artifactPath), { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outcome: evidence.outcome, eventStatus: evidence.eventStatus, deliveryStatus: evidence.delivery?.status || null, artifact: path.relative(repoRoot, artifactPath) }));
if (!['backend_sent', 'not_ready', 'ready'].includes(evidence.outcome)) process.exitCode = 1;
