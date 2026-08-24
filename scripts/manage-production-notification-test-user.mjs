import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const projectId = 'missing-person-alram';
const action = process.argv[2] || 'create';
const statePathArg = process.argv[3];

const firebaseConfigSource = await readFile(path.join(repoRoot, 'frontend', 'src', 'services', 'firebaseConfig.ts'), 'utf8');
const apiKey = firebaseConfigSource.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY_NOT_FOUND');

const oauthToken = (process.platform === 'win32'
  ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud.cmd auth print-access-token --quiet'], { encoding: 'utf8' })
  : execFileSync('gcloud', ['auth', 'print-access-token', '--quiet'], { encoding: 'utf8' }))
  .trim();
const headers = { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId };
const identityAdminUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const requestJson = async (url, options, label, expectedStatuses = [200]) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!expectedStatuses.includes(response.status)) {
    const code = typeof body?.error?.message === 'string' ? body.error.message : typeof body?.error === 'string' ? body.error : 'UNKNOWN_ERROR';
    throw new Error(`${label}:${response.status}:${code.slice(0, 100)}`);
  }
  return body;
};

const assertSafeStatePath = (candidate) => {
  if (!candidate) throw new Error('STATE_PATH_REQUIRED');
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('missingalert-notification-test-') || !resolved.endsWith('.json')) {
    throw new Error('UNSAFE_STATE_PATH');
  }
  return resolved;
};

const deleteFirestoreDocument = async (documentPath) => requestJson(
  `${firestoreBase}/${documentPath}`,
  { method: 'DELETE', headers },
  'DELETE_FIRESTORE_DOCUMENT',
  [200, 404],
);

const runQuery = async (structuredQuery) => requestJson(
  `${firestoreBase}:runQuery`,
  { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) },
  'FIRESTORE_QUERY',
);

if (action === 'create') {
  const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const email = `missingalert-notification-test-${runId}@example.com`;
  const password = `Ma!${randomBytes(20).toString('base64url')}`;
  const body = await requestJson(
    `${identityAdminUrl}/accounts?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', headers, body: JSON.stringify({ email, password, emailVerified: true, displayName: 'MissingAlert notification test' }) },
    'CREATE_TEST_USER',
  );
  if (!body.localId) throw new Error('CREATE_TEST_USER:NO_LOCAL_ID');
  const statePath = path.join(os.tmpdir(), `missingalert-notification-test-${runId}.json`);
  await writeFile(statePath, `${JSON.stringify({ schemaVersion: 1, projectId, localId: body.localId, email, password, createdAt: new Date().toISOString() })}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(statePath, 0o600).catch(() => undefined);
  console.log(JSON.stringify({ created: true, statePath }));
} else if (action === 'sanitize') {
  const statePath = assertSafeStatePath(statePathArg);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  await writeFile(statePath, `${JSON.stringify({ ...state, password: null, sanitizedAt: new Date().toISOString() })}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(JSON.stringify({ sanitized: true, statePath }));
} else if (action === 'delete') {
  const statePath = assertSafeStatePath(statePathArg);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (state.projectId !== projectId || typeof state.localId !== 'string') throw new Error('INVALID_STATE_FILE');

  const testEvents = await runQuery({
    from: [{ collectionId: 'notificationEvents' }],
    where: { fieldFilter: { field: { fieldPath: 'targetUserIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: state.localId } } },
    limit: 20,
  });
  let deletedEvents = 0;
  for (const result of testEvents) {
    const eventDocument = result.document;
    if (!eventDocument?.name || eventDocument.fields?.type?.stringValue !== 'notification_test') continue;
    const eventId = eventDocument.name.split('/').pop();
    const deliveries = await requestJson(
      `${firestoreBase}/notificationEvents/${encodeURIComponent(eventId)}/deliveries?pageSize=100`,
      { method: 'GET', headers },
      'LIST_TEST_DELIVERIES',
    );
    for (const delivery of deliveries.documents || []) {
      const relativeName = delivery.name.split('/documents/')[1];
      await deleteFirestoreDocument(relativeName);
    }
    await deleteFirestoreDocument(`notificationEvents/${encodeURIComponent(eventId)}`);
    deletedEvents += 1;
  }

  await deleteFirestoreDocument(`userTokens/${encodeURIComponent(state.localId)}`);
  await deleteFirestoreDocument(`notificationSubscriptions/${encodeURIComponent(state.localId)}`);
  await requestJson(
    `${identityAdminUrl}/accounts:delete`,
    { method: 'POST', headers, body: JSON.stringify({ localId: state.localId }) },
    'DELETE_TEST_USER',
  );
  await unlink(statePath);
  console.log(JSON.stringify({ deleted: true, deletedEvents, statePathRemoved: true }));
} else {
  throw new Error('UNKNOWN_ACTION');
}
