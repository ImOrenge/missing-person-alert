import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const artifactPath = path.join(repoRoot, 'artifacts', 'reporting-refactor', 'production-fcm-delivery-smoke.json');
const projectId = 'missing-person-alram';
const eventId = process.argv[2] || '';
if (!/^notification-test-[0-9]+$/.test(eventId)) {
  throw new Error('Usage: node scripts/inspect-production-notification-event.mjs notification-test-<timestamp>');
}

const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], { encoding: 'utf8' })
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }))
  .trim();
const headers = { Authorization: `Bearer ${oauthToken}`, 'x-goog-user-project': projectId };
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/notificationEvents/${encodeURIComponent(eventId)}`;

const fetchJson = async (url) => {
  const response = await fetch(url, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FIRESTORE_READ_${response.status}`);
  return body;
};

const valueOf = (field) => field?.stringValue ?? field?.integerValue ?? field?.booleanValue ?? field?.timestampValue ?? null;
const arrayOfStrings = (field) => (field?.arrayValue?.values || [])
  .map((item) => item?.stringValue)
  .filter((item) => typeof item === 'string');

const [eventDocument, deliveries] = await Promise.all([
  fetchJson(base),
  fetchJson(`${base}/deliveries?pageSize=20`),
]);
const delivery = deliveries.documents?.[0]?.fields || null;
const previous = JSON.parse(await readFile(artifactPath, 'utf8'));
const deliveryStatus = valueOf(delivery?.status);
const storedProviderErrorCodes = arrayOfStrings(delivery?.providerErrorCodes);
const outcome = deliveryStatus === 'sent'
  ? 'backend_sent'
  : deliveryStatus === 'permanent_failed'
    ? 'permanent_failed'
    : deliveryStatus === 'suppressed'
      ? 'suppressed'
      : deliveryStatus || 'missing_delivery';
const evidence = {
  ...previous,
  inspectedAt: new Date().toISOString(),
  eventId,
  outcome,
  eventStatus: valueOf(eventDocument.fields?.status),
  targetedCount: Number(valueOf(eventDocument.fields?.targetedCount) ?? 0),
  delivery: delivery ? {
    status: deliveryStatus,
    attempts: Number(valueOf(delivery.attempts) ?? 0),
    successCount: Number(valueOf(delivery.successCount) ?? 0),
    failureCount: Number(valueOf(delivery.failureCount) ?? 0),
    lastErrorCode: valueOf(delivery.lastErrorCode),
    ...(deliveryStatus === 'sent'
      ? {historicalProviderErrorCodes: storedProviderErrorCodes}
      : {providerErrorCodes: storedProviderErrorCodes}),
    sentAt: valueOf(delivery.sentAt),
  } : null,
  userReceiptConfirmed: false,
};

await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  eventId,
  outcome,
  eventStatus: evidence.eventStatus,
  deliveryStatus,
  attempts: evidence.delivery?.attempts ?? 0,
  providerErrorCodes: evidence.delivery?.providerErrorCodes || [],
  historicalProviderErrorCodes: evidence.delivery?.historicalProviderErrorCodes || [],
  artifact: path.relative(repoRoot, artifactPath),
}));
