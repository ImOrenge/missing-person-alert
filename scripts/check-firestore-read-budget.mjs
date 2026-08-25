import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8');

const [apiHook, apiService, functionsIndex, searchService] = await Promise.all([
  read('frontend/src/hooks/useApiData.ts'),
  read('frontend/src/services/apiService.ts'),
  read('functions/src/index.ts'),
  read('functions/src/search/search-service.ts'),
]);

assert.doesNotMatch(apiHook, /onSnapshot|collection\(firestore,\s*['"]missingPersons['"]\)/);
assert.match(apiHook, /fetchMissingPersons\(\)/);
assert.match(apiHook, /REFRESH_INTERVAL_MS = 10 \* 60 \* 1000/);
assert.match(apiService, /\/api\/safe182\/missing-persons\?limit=500/);

assert.match(functionsIndex, /PUBLIC_MISSING_PERSON_CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(functionsIndex, /if \(!publicMissingPersonCachePromise\)/);
assert.match(functionsIndex, /if \(!seoPersonCachePromise\)/);
assert.match(functionsIndex, /s-maxage=300, stale-while-revalidate=600/);
assert.match(functionsIndex, /previousSnapshotFingerprint === snapshotFingerprint/);
assert.match(functionsIndex, /if \(!meaningfulChange\) continue/);
assert.match(functionsIndex, /shouldRefreshRegionStatistics\(\)/);

assert.match(searchService, /CASE_CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(searchService, /if \(caseCandidatePromise\) return caseCandidatePromise/);
assert.match(searchService, /if \(reportCandidatePromise\) return reportCandidatePromise/);

console.log('Firestore read-budget contracts passed');
