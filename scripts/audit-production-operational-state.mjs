import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'missing-person-alram';
const artifactPath = path.join(repoRoot, 'artifacts', 'reporting-refactor', 'production-operational-state-20260823.json');
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], { encoding: 'utf8' })
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }))
  .trim();
const headers = { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId };

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`REQUEST_${response.status}:${String(body?.error?.message || 'UNKNOWN').slice(0, 100)}`);
  return body;
};

const countCollection = async (collectionId) => {
  const rows = await requestJson(`${firestoreBase}:runAggregationQuery`, {
    method: 'POST',
    body: JSON.stringify({structuredAggregationQuery: {
      structuredQuery: {from: [{collectionId}]},
      aggregations: [{alias: 'count', count: {}}],
    }}),
  });
  return Number(rows?.[0]?.result?.aggregateFields?.count?.integerValue || 0);
};

const valueOf = (field) => field?.booleanValue ?? field?.stringValue ?? field?.integerValue ?? field?.timestampValue ?? null;
const decodeFlags = (document) => {
  const root = document?.fields || {};
  const nested = root.flags?.mapValue?.fields || {};
  const merged = {...root, ...nested};
  return Object.fromEntries(Object.entries(merged)
    .filter(([, field]) => typeof field?.booleanValue === 'boolean')
    .map(([name, field]) => [name, field.booleanValue]));
};

const collectionNames = [
  'sightingReports',
  'publicReports',
  'migrationQuarantine',
  'migrationRuns',
  'notificationSubscriptions',
  'userTokens',
  'notificationEvents',
  'roleAuditLogs',
];
const counts = Object.fromEntries(await Promise.all(collectionNames.map(async (name) => [name, await countCollection(name)])));
const [runtimeConfig, tokenDocuments, quarantineDocuments] = await Promise.all([
  requestJson(`${firestoreBase}/runtimeConfig/reporting`),
  requestJson(`${firestoreBase}/userTokens?pageSize=100`),
  requestJson(`${firestoreBase}/migrationQuarantine?pageSize=100`),
]);
let activeTokenCount = 0;
for (const document of tokenDocuments.documents || []) {
  const tokens = document.fields?.tokens?.mapValue?.fields || {};
  activeTokenCount += Object.values(tokens).filter((entry) => typeof entry?.mapValue?.fields?.token?.stringValue === 'string').length;
}
const quarantineStatusCounts = {};
for (const document of quarantineDocuments.documents || []) {
  const status = document.fields?.status?.stringValue || 'unknown';
  quarantineStatusCounts[status] = (quarantineStatusCounts[status] || 0) + 1;
}

const evidence = {
  schemaVersion: 1,
  projectId,
  auditedAt: new Date().toISOString(),
  counts,
  quarantineStatusCounts,
  activeTokenCount,
  flags: decodeFlags(runtimeConfig),
  runtimeConfigUpdatedAt: valueOf(runtimeConfig.fields?.updatedAt),
  containsPrivateValues: false,
};
await mkdir(path.dirname(artifactPath), {recursive: true});
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({counts, quarantineStatusCounts, activeTokenCount, flags: evidence.flags, artifact: path.relative(repoRoot, artifactPath)}));
