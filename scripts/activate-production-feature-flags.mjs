import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'missing-person-alram';
const confirm = process.argv.includes('--confirm');
const artifactPath = path.join(
  repoRoot,
  'artifacts',
  'reporting-refactor',
  'production-feature-activation-20260823.json',
);
const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/runtimeConfig/reporting`;

const enabledFlags = [
  'emergency_banner_v2_enabled',
  'dashboard_v2_enabled',
  'mobile_nav_v2_enabled',
  'unified_search_enabled',
  'unified_explorer_enabled',
  'reports_map_layer_enabled',
  'case_detail_v2_enabled',
  'reporting_flow_v2_enabled',
  'reports_submission_enabled',
  'reports_media_enabled',
  'reports_admin_enabled',
  'reports_public_timeline_enabled',
  'reports_notifications_enabled',
  'reports_public_indexing_enabled',
  'dashboard_personalization_enabled',
  'admin_banner_v2_enabled',
];

// These require an approved Algolia account, restricted keys, and a deployed
// runtime configuration. Enabling them without those prerequisites would only
// cause provider errors followed by the Firestore fallback.
const intentionallyDisabledFlags = [
  'algolia_indexing_enabled',
  'algolia_search_enabled',
];

const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], {encoding: 'utf8'})
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], {encoding: 'utf8'}))
  .trim();
const headers = {
  Authorization: `Bearer ${oauthToken}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': projectId,
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {...options, headers: {...headers, ...(options.headers || {})}});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`REQUEST_${response.status}:${String(body?.error?.message || 'UNKNOWN').slice(0, 200)}`);
  }
  return body;
};

const decodeFlags = (document) => {
  const nested = document?.fields?.flags?.mapValue?.fields || {};
  return Object.fromEntries(Object.entries(nested)
    .filter(([, field]) => typeof field?.booleanValue === 'boolean')
    .map(([name, field]) => [name, field.booleanValue]));
};

const beforeDocument = await requestJson(documentUrl);
const before = decodeFlags(beforeDocument);
const requested = Object.fromEntries([
  ...enabledFlags.map((name) => [name, true]),
  ...intentionallyDisabledFlags.map((name) => [name, false]),
]);

if (!confirm) {
  console.log(JSON.stringify({dryRun: true, projectId, before, requested}, null, 2));
  process.exit(0);
}

const now = new Date().toISOString();
const fields = Object.fromEntries(Object.entries(requested).map(([name, value]) => [name, {booleanValue: value}]));
const updateMask = [
  ...Object.keys(requested).map((name) => ['updateMask.fieldPaths', `flags.${name}`]),
  ['updateMask.fieldPaths', 'updatedAt'],
  ['updateMask.fieldPaths', 'activationStage'],
];
const query = new URLSearchParams(updateMask).toString();
await requestJson(`${documentUrl}?${query}`, {
  method: 'PATCH',
  body: JSON.stringify({
    fields: {
      flags: {mapValue: {fields}},
      updatedAt: {timestampValue: now},
      activationStage: {stringValue: 'implemented-features-on-provider-gates-preserved'},
    },
  }),
});

const afterDocument = await requestJson(documentUrl);
const after = decodeFlags(afterDocument);
for (const [name, expected] of Object.entries(requested)) {
  if (after[name] !== expected) throw new Error(`FLAG_VERIFICATION_FAILED:${name}`);
}

const evidence = {
  schemaVersion: 1,
  projectId,
  activatedAt: now,
  before,
  requested,
  after,
  enabledFlags,
  providerGatedFlags: intentionallyDisabledFlags,
  providerGateReason: 'Algolia credentials and deployed runtime provider configuration are absent',
  containsPrivateValues: false,
};
await mkdir(path.dirname(artifactPath), {recursive: true});
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  activated: enabledFlags.length,
  providerGated: intentionallyDisabledFlags,
  artifact: path.relative(repoRoot, artifactPath),
}));
