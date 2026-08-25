import assert from 'node:assert/strict';

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'demo-missingalert';
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const baseUrl = `http://${functionsHost}/${projectId}/asia-northeast3/api`;

const requestJson = async (path, init) => {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const config = await requestJson('/api/config/ui');
assert.equal(config.response.status, 200);
assert.equal(config.body.success, true);
assert.equal(Object.values(config.body.flags).every((value) => value === false), true);

const publicCasesMiss = await requestJson('/api/safe182/missing-persons?limit=500');
assert.equal(publicCasesMiss.response.status, 200);
assert.equal(publicCasesMiss.body.result, '00');
assert.equal(Array.isArray(publicCasesMiss.body.list), true);
assert.match(publicCasesMiss.response.headers.get('cache-control') || '', /s-maxage=300/);
assert.equal(publicCasesMiss.response.headers.get('x-missingalert-data-cache'), 'MISS');
const publicCasesHit = await requestJson('/api/safe182/missing-persons?limit=500');
assert.equal(publicCasesHit.response.headers.get('x-missingalert-data-cache'), 'HIT');

const search = await requestJson('/api/search?q=%EC%84%9C%EC%9A%B8&tab=cases');
assert.equal(search.response.status, 200);
assert.equal(search.body.success, true);
assert.equal(search.body.provider, 'firestore-fallback');
assert.equal(Array.isArray(search.body.items), true);
assert.equal(search.response.headers.get('cache-control'), 'private, no-store');

const privateSearch = await requestJson('/api/search/query', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ q: '서울', tab: 'cases', filters: { region: '서울' }, limit: 20 }),
});
assert.equal(privateSearch.response.status, 200);
assert.equal(typeof privateSearch.body.requestId, 'string');
assert.equal(privateSearch.body.page.limit, 20);

const sensitiveSearch = await requestJson('/api/search/query', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ q: '010-1234-5678', tab: 'all' }),
});
assert.equal(sensitiveSearch.response.status, 400);

const disabledExplore = await requestJson('/api/v2/explore/reports?west=124&south=33&east=132&north=39.5&zoom=7');
assert.equal(disabledExplore.response.status, 404);
assert.equal(disabledExplore.body.error, 'REPORT_MAP_LAYER_DISABLED');

const unauthenticatedReport = await requestJson('/api/v2/reports', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
assert.equal(unauthenticatedReport.response.status, 401);

const banners = await requestJson('/api/v2/banners');
assert.equal(banners.response.status, 200);
assert.deepEqual(banners.body.banners, []);

console.log('Functions emulator cached public cases, config, private POST search, disabled explorer, auth, and banner checks passed');
