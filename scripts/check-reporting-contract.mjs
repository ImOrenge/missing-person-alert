import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { validateCreateReportInput } = require('../functions/lib/reports/report-validation.js');
const { projectOfficialCaseSearchItem, projectPublicReportSearchItem } = require('../functions/lib/search/project-public-record.js');
const { matchesKoreanQuery, toKoreanInitials } = require('../functions/lib/search/normalize-korean.js');
const { buildMissingPersonHtml } = require('../functions/lib/missingPersonSeo.js');
const {
  REPORTING_FEATURE_FLAG_NAMES,
  DISABLED_REPORTING_FEATURE_FLAGS,
  SEARCH_FEATURE_FLAG_NAMES,
  DISABLED_SEARCH_FEATURE_FLAGS,
} = require('../functions/lib/runtimeConfig.js');
const {buildAlgoliaIndexAction} = require('../functions/lib/search/algolia-indexing.js');
const {
  buildAlgoliaSearchRequests,
  normalizeAlgoliaConfig,
  sanitizeAlgoliaHit,
} = require('../functions/lib/search/algolia-client.js');
const { projectLegacyReport, legacyDestinationId } = require('../functions/lib/reports/legacy-migration.js');
const { subscriptionMatchesEvent, buildNotificationContent, deriveRegionCode } = require('../functions/lib/notifications/dispatcher.js');

const functionsSource = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
assert.match(functionsSource, /LEGACY_REPORTING_RETIRED/, 'legacy report routes must retain a fail-closed tombstone');
assert.equal(/app\.post\(\s*["']\/api\/reports["']/.test(functionsSource), false, 'unsafe legacy report submission body must be removed');

assert.deepEqual(REPORTING_FEATURE_FLAG_NAMES, [
  'reports_submission_enabled',
  'reports_media_enabled',
  'reports_admin_enabled',
  'reports_public_timeline_enabled',
  'reports_map_layer_enabled',
  'reports_notifications_enabled',
  'reports_public_indexing_enabled',
]);
assert.equal(Object.values(DISABLED_REPORTING_FEATURE_FLAGS).every((value) => value === false), true, 'all reporting flags must fail closed');
assert.deepEqual(SEARCH_FEATURE_FLAG_NAMES, ['algolia_indexing_enabled', 'algolia_search_enabled']);
assert.equal(Object.values(DISABLED_SEARCH_FEATURE_FLAGS).every((value) => value === false), true, 'Algolia must fail closed');

const validInput = {
  clientRequestId: '0123456789abcdef0123456789abcdef',
  caseId: 'case-safe-1',
  reportType: 'sighting',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  location: { address: '서울특별시 중구 테스트로', lat: 37.123456, lng: 127.123456 },
  description: '검은색 외투를 입고 지하철역 방향으로 이동하는 모습을 보았습니다.',
  mediaIds: [],
  consent: { processing: true, accuracy: true, sensitiveLocation: true },
};

assert.equal(validateCreateReportInput(validInput).ok, true, 'valid private report input should pass');
assert.equal(validateCreateReportInput({ ...validInput, occurredAt: new Date(Date.now() + 60 * 60_000).toISOString() }).ok, false, 'future report time must fail');
assert.equal(validateCreateReportInput({ ...validInput, consent: { processing: true, accuracy: false, sensitiveLocation: true } }).ok, false, 'missing consent must fail');
assert.equal(validateCreateReportInput({ ...validInput, status: 'approved' }).ok, false, 'server-controlled fields must be rejected');
assert.equal(validateCreateReportInput({ ...validInput, location: { address: '서울 중구', lat: '37.5', lng: 127 } }).ok, false, 'coordinates must be numeric values');
assert.equal(validateCreateReportInput({ ...validInput, description: '주민번호 900101-1234567을 포함한 민감한 제보 내용입니다.' }).ok, false, 'resident identifiers must be rejected');
assert.equal(validateCreateReportInput({ ...validInput, description: '관련 링크가 너무 많습니다 https://a.test https://b.test https://c.test' }).ok, false, 'URL spam must be rejected');
assert.equal(validateCreateReportInput({ ...validInput, contact: {email: 'not-an-email'} }).ok, false, 'invalid contact must be rejected');
const validContactResult = validateCreateReportInput({ ...validInput, contact: { phone: '010-1234-5678', email: 'reporter@example.test', preferred: 'email' } });
assert.equal(validContactResult.ok, true, 'valid optional encrypted-contact input should pass');
assert.deepEqual(validContactResult.input.contact, { phone: '010-1234-5678', email: 'reporter@example.test', preferred: 'email' });

const official = projectOfficialCaseSearchItem('case-1', {
  source: 'api', status: 'active', seoVisible: true, name: '홍길동',
  location: { address: '서울특별시 중구 테스트로', lat: 37.123456, lng: 127.123456 },
  reportedBy: { phone: '010-0000-0000' }, description: '검은 외투',
});
assert.ok(official, 'eligible official case should project');
const officialJson = JSON.stringify(official);
for (const forbidden of ['lat', 'lng', 'reportedBy', 'phone', 'exactLocation', 'rawText', 'contact']) {
  assert.equal(officialJson.includes(`"${forbidden}"`), false, `official projection must exclude ${forbidden}`);
}
assert.equal(projectOfficialCaseSearchItem('user-report', { source: 'user_report', status: 'active', seoVisible: true, name: '비공개' }), null, 'unreviewed user records must not project as official cases');

const publicReport = projectPublicReportSearchItem('report-1', {
  visibility: 'public', status: 'approved', caseId: 'case-1',
  publicSummary: { title: '중구 목격 제보', summary: '운영자 검토 공개 문구', regionLabel: '서울 중구' },
  exactLocation: { lat: 37.123456, lng: 127.123456 }, rawText: '비공개 원문', contact: { phone: '010' },
});
assert.ok(publicReport, 'approved public report should project');
const publicJson = JSON.stringify(publicReport);
for (const forbidden of ['lat', 'lng', 'exactLocation', 'rawText', 'contact', 'phone']) {
  assert.equal(publicJson.includes(`"${forbidden}"`), false, `public report projection must exclude ${forbidden}`);
}
assert.ok(projectPublicReportSearchItem('forwarded-report', {
  visibility: 'public', status: 'forwarded', caseId: 'case-1',
  publicSummary: { title: '기관 전달 제보', summary: '운영자 검토 공개 문구', regionLabel: '서울 중구' },
}), 'forwarded public report should remain discoverable');
const standalonePublicReport = projectPublicReportSearchItem('standalone-report', {
  visibility: 'public', status: 'approved', reportType: 'new_case_lead', caseId: null,
  publicDescription: '사건 연결 전 독립 공개 제보 전체 내용', publicLocationText: '서울특별시 종로구 전체 주소',
  publicSummary: {title: '서울특별시 종로구 전체 주소 목격 제보', summary: '사건 연결 전 독립 공개 제보 전체 내용', regionLabel: '서울특별시 종로구 전체 주소'},
});
assert.equal(standalonePublicReport?.href, '/map?publicReportId=standalone-report', 'standalone public report must link to its map marker');
assert.equal(projectPublicReportSearchItem('expired-standalone-report', {
  visibility: 'public', status: 'approved', reportType: 'new_case_lead', caseId: null,
  expiresAt: new Date(Date.now() - 60_000).toISOString(),
  publicSummary: {title: '만료된 독립 제보', summary: '검색되면 안 되는 만료 제보'},
}), null, 'expired standalone reports must not remain searchable');
assert.equal(projectPublicReportSearchItem('withdrawn-report', {
  visibility: 'public', status: 'withdrawn', caseId: 'case-1',
  publicSummary: { title: '취소 제보' },
}), null, 'withdrawn report must never project');

const algoliaConfig = normalizeAlgoliaConfig({applicationId: 'APP123', apiKey: 'restricted-key', indexPrefix: 'missingalert_prod'});
assert.ok(algoliaConfig, 'restricted Algolia config should normalize');
const algoliaRequests = buildAlgoliaSearchRequests(algoliaConfig, {
  query: '서울', tab: 'all', region: '중구', limit: 30, includeReports: false,
});
assert.equal(algoliaRequests.length, 2, 'report index must remain excluded while public indexing is off');
assert.equal(algoliaRequests.every((request) => request.analytics === false && request.clickAnalytics === false), true, 'Algolia analytics must be disabled per request');
assert.equal(algoliaRequests.every((request) => !request.attributesToRetrieve.includes('contact')), true, 'Algolia retrieval allowlist must exclude contact');
const algoliaAction = buildAlgoliaIndexAction('case', 'case-1', {
  source: 'api', status: 'active', seoVisible: true, name: '홍길동',
  location: {address: '서울특별시 중구', lat: 37.1, lng: 127.1}, contact: {phone: '010'},
}, false);
assert.equal(algoliaAction.action, 'upsert');
assert.equal(JSON.stringify(algoliaAction).includes('phone'), false, 'Algolia index action must exclude private fields');
assert.equal(buildAlgoliaIndexAction('report', 'private-report', {
  visibility: 'private', status: 'submitted', caseId: 'case-1', rawText: '비공개',
}, true).action, 'delete', 'ineligible reports must be deleted from Algolia');
assert.deepEqual(sanitizeAlgoliaHit({
  objectID: 'case-1', id: 'case-1', kind: 'case', title: '홍길동', summary: '공개 요약',
  sourceLabel: '공식정보', href: '/missing/case-1', contact: {phone: '010'}, _rankingInfo: {secret: true},
}), {
  id: 'case-1', kind: 'case', title: '홍길동', summary: '공개 요약', sourceLabel: '공식정보', href: '/missing/case-1',
}, 'Algolia response sanitizer must drop provider metadata and unknown fields');
const longPublicReportText = '공개 제보 전체 본문 '.repeat(80);
const sanitizedLongReport = sanitizeAlgoliaHit({
  objectID: 'report-1', id: 'report-1', kind: 'report', title: '독립 공개 제보', summary: longPublicReportText,
  regionLabel: '서울특별시 종로구 전체 주소', sourceLabel: '사용자 제보 · 운영 검토 완료', href: '/map?publicReportId=report-1',
});
assert.equal(sanitizedLongReport?.summary, longPublicReportText.trim(), 'Algolia must preserve the full public report body');
assert.equal(sanitizedLongReport?.regionLabel, '서울특별시 종로구 전체 주소', 'Algolia must preserve the full approved report address');

assert.equal(toKoreanInitials('서울중구'), 'ㅅㅇㅈㄱ');
assert.equal(matchesKoreanQuery('ㅅㅇ', ['서울 중구']), true, 'Korean initial search should match');

const migrationProjection = projectLegacyReport('legacy-case-1', {
  name: '이관 대상', age: 20, description: '레거시 제보 설명',
  location: {address: '서울특별시 중구', lat: 37.5665, lng: 126.9780},
  reportedBy: {uid: 'legacy-owner', email: 'private@example.test', phoneNumber: '010-1234-5678'},
});
assert.equal(migrationProjection.destinationId, legacyDestinationId('legacy-case-1'), 'legacy destination IDs must be deterministic');
assert.equal(migrationProjection.report.status, 'submitted');
assert.equal(migrationProjection.report.visibility, 'private');
assert.equal(migrationProjection.quarantineReasons.includes('case_link_required'), true);
assert.equal(migrationProjection.quarantineReasons.includes('suspected_default_coordinate'), true);
assert.equal(JSON.stringify(migrationProjection.report).includes('private@example.test'), false, 'plaintext contact must not enter migrated report');

const notificationEvent = {type: 'new_approved_report', caseId: 'case-1', regionLabel: '서울 중구', publicLocation: {lat: 37.56, lng: 126.98}};
assert.equal(deriveRegionCode(notificationEvent.regionLabel), 'seoul');
assert.equal(subscriptionMatchesEvent({userId: 'u1', pushEnabled: true, caseIds: [], regionCodes: ['seoul'], radius: null}, notificationEvent), true);
assert.equal(subscriptionMatchesEvent({userId: 'u2', pushEnabled: false, caseIds: ['case-1'], regionCodes: [], radius: null}, notificationEvent), false);
assert.equal(subscriptionMatchesEvent({userId: 'u3', pushEnabled: true, caseIds: [], regionCodes: [], radius: null}, {type: 'case_closed', targetUserIds: ['u3']}), true, 'case closure recipient snapshot must survive subscription removal');
assert.equal(subscriptionMatchesEvent({userId: 'u4', pushEnabled: true, caseIds: [], regionCodes: ['seoul'], radius: null}, {type: 'notification_test', regionCode: 'seoul'}), false, 'notification test must never use broad region targeting');
assert.equal(subscriptionMatchesEvent({userId: 'u4', pushEnabled: true, caseIds: [], regionCodes: [], radius: null}, {type: 'notification_test', targetUserIds: ['u4']}), true, 'notification test must require an explicit target user');
assert.deepEqual(buildNotificationContent({type: 'notification_test'}), {title: 'MissingAlert 알림 테스트', body: '이 기기에서 안전 알림을 정상적으로 받을 수 있습니다.', link: '/alerts'});
const notificationJson = JSON.stringify(buildNotificationContent(notificationEvent));
for (const forbidden of ['37.56', '126.98', 'phone', 'email', 'contact']) assert.equal(notificationJson.includes(forbidden), false, `notification must exclude ${forbidden}`);

const html = buildMissingPersonHtml({
  id: 'case-1', name: '홍길동', age: 30, gender: 'M', address: '서울특별시 중구',
  missingDate: new Date().toISOString(), description: '공식 인상착의', type: 'missing_child',
  photo: null, height: null, clothes: '검은 외투', updatedAt: new Date(),
}, [{ id: 'report-1', reportType: 'sighting', occurredAt: new Date().toISOString(), publicDescription: '검토된 공개 문구', publicLocationText: '서울 중구 일대', publicStatus: 'approved' }]);
assert.match(html, /사용자 제보 · 운영 검토 완료/);
assert.match(html, /공식 확인 정보와 다를 수 있으며/);
assert.equal(html.includes('37.123456'), false, 'case HTML must not contain private exact coordinates');

console.log('Reporting, public projection, Korean search, and case timeline contract checks passed');
