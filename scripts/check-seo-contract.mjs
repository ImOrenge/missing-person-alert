import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const seo = require('../functions/lib/missingPersonSeo.js');
const seoMetrics = require('../functions/lib/seoMetrics.js');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const { JSDOM } = frontendRequire('jsdom');

const assertInlineScriptsParse = (document, label) => {
  const scripts = [...document.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((match) => !/application\/ld\+json/i.test(match[1]))
    .map((match) => match[2]);
  assert.ok(scripts.length > 0, `${label} should contain an executable inline script`);
  scripts.forEach((script, index) => new vm.Script(script, { filename: `${label}-inline-${index + 1}.js` }));
};

const runCollectionTracking = (document, referrer) => {
  const beacons = [];
  const dom = new JSDOM(document, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://missingalert.kr/missing/region/seoul',
    referrer,
    beforeParse(window) {
      window.Blob = class TestBlob {
        constructor(parts) { this.payload = parts.join(''); }
      };
      Object.defineProperty(window.navigator, 'sendBeacon', {
        configurable: true,
        value: (url, blob) => {
          beacons.push({ url, body: JSON.parse(blob.payload) });
          return true;
        },
      });
    },
  });
  const card = dom.window.document.querySelector('[data-seo-case-id]');
  card?.addEventListener('click', (event) => event.preventDefault(), { capture: true });
  card?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  dom.window.close();
  return beacons;
};

const runDetailActionTracking = (document) => {
  const beacons = [];
  const dom = new JSDOM(document, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://missingalert.kr/missing/safe-182-case-1',
    beforeParse(window) {
      window.Blob = class TestBlob {
        constructor(parts) { this.payload = parts.join(''); }
      };
      Object.defineProperty(window.navigator, 'sendBeacon', {
        configurable: true,
        value: (url, blob) => {
          beacons.push({ url, body: JSON.parse(blob.payload) });
          return true;
        },
      });
    },
  });
  const mapLinks = [...dom.window.document.querySelectorAll('[data-seo-event="seo_app_cta_click"]')];
  mapLinks.forEach((link) => link.addEventListener('click', (event) => event.preventDefault(), { capture: true }));
  mapLinks.forEach((link) => link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
  mapLinks[0]?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  dom.window.close();
  return beacons;
};

const person = {
  id: 'safe-182-case-1',
  name: '김○○',
  age: 72,
  ageAtMissing: null,
  gender: 'M',
  address: '서울특별시 강서구 화곡동',
  missingDate: '2026-08-20T01:00:00.000Z',
  description: '회색 상의와 검은 바지',
  type: 'dementia',
  photo: null,
  height: 168,
  clothes: '회색 상의와 검은 바지',
  updatedAt: new Date('2026-08-20T03:00:00.000Z'),
};

const html = seo.buildMissingPersonHtml(person);
assert.match(html, /<title>\[실종 치매환자 찾습니다\]/);
assert.match(html, /사진·인상착의와 지도에서 확인/);
assert.match(html, /지도에서 바로 확인/);
assert.match(html, /서울특별시 강서구 화곡동 실종 치매환자 김○○님을 찾습니다/);
assert.match(html, /현재 수색 중/);
assert.match(html, /\/map\?personId=safe-182-case-1/);
assert.doesNotMatch(html, /utm_(source|medium|campaign|content)/);
assert.match(html, /data-seo-event="seo_app_cta_click"/);
assert.match(html, /data-seo-event="report_started"/);
assert.match(html, /seo_detail_view/);
assert.match(html, /seo_return_visit/);
assert.match(html, /missingalert_search_first_seen/);
assert.match(html, /seo_search_entry/);
assert.match(html, /seo_detail_started/);
assert.match(html, /pageGroup:"detail"/);
assert.match(html, /seo_action:/);
assertInlineScriptsParse(html, 'detail');
assert.deepEqual(runDetailActionTracking(html).map((beacon) => beacon.body.event), ['seo_app_cta_click']);
assert.match(html, /google|naver|bing|daum/);
assert.match(html, /href="tel:112"/);
assert.match(html, /공식 페이지 공유/);
assert.equal((html.match(/<h1/g) || []).length, 1);
assert.match(html, /<link rel="canonical" href="https:\/\/missingalert\.kr\/missing\/safe-182-case-1"/);

const malicious = seo.buildMissingPersonHtml({...person, name: '<script>alert(1)</script>'});
assert.doesNotMatch(malicious, /<h1><script>/);
assert.match(malicious, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

assert.equal(seo.getPublicRegionForAddress(person.address)?.slug, 'seoul');
assert.equal(seo.getPublicRegionForAddress('경기도 수원시')?.slug, 'gyeonggi');
assert.equal(seo.getPublicRegionForAddress('해외')?.slug, undefined);
assert.equal(seo.getPublicMissingType('child')?.types[0], 'missing_child');
assert.equal(seo.getPublicMissingTypeForType('dementia')?.slug, 'dementia');
assert.equal(seo.getPublicMissingType('invalid'), undefined);
assert.equal(seo.PUBLIC_REGIONS.length, 17);
assert.deepEqual(seo.PUBLIC_MISSING_TYPES.map((item) => item.slug), ['child', 'dementia', 'disability']);
assert.equal(seo.getPublicSubRegionName('서울특별시 강서구 화곡동', seo.getPublicRegion('seoul')), '강서구');
assert.equal(seo.getPublicSubRegionName('경기도 수원시 팔달구 인계동', seo.getPublicRegion('gyeonggi')), '수원시 팔달구');
assert.equal(seo.getPublicSubRegionName('세종특별자치시 조치원읍', seo.getPublicRegion('sejong')), null);
const subRegionPersons = [person, {...person, id: 'safe-182-case-2'}, {...person, id: 'safe-182-case-3'}];
const subRegionCandidates = seo.buildPublicSubRegionCandidates(subRegionPersons);
assert.equal(subRegionCandidates.length, 1);
assert.equal(subRegionCandidates[0].name, '강서구');
assert.equal(subRegionCandidates[0].slug, '강서구');
assert.equal(seo.buildPublicSubRegionCandidates(subRegionPersons.slice(0, 2)).length, 0);
const pilotPersons = ['강서구', '강남구', '강동구', '강북구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동작구']
  .flatMap((district, districtIndex) => Array.from({length: 3}, (_, caseIndex) => ({
    ...person, id: `pilot-${districtIndex}-${caseIndex}`, address: `서울특별시 ${district} 테스트동`,
  })));
assert.equal(seo.buildPublicSubRegionCandidates(pilotPersons).length, 10);

const collection = seo.buildMissingPersonCollectionHtml({
  title: '서울특별시 실종자 현황 - 최신 공개 정보',
  description: '현재 공개 수색 중인 실종자 정보입니다.',
  canonicalPath: '/missing/region/seoul',
  eyebrow: '서울특별시 공개 수색 정보',
  supportingCopy: '서울 지역에서 이름과 인상착의로 실종자를 검색할 수 있습니다.',
  relatedLinks: [
    { href: '/missing', label: '전체 실종자 검색·조회' },
    { href: '/missing/type/dementia', label: '치매환자 실종' },
  ],
  linkSections: [
    { heading: '지역별 실종자 현황', links: [{ href: '/missing/region/seoul', label: '서울특별시 실종자 현황' }] },
  ],
  totalCount: 307,
  persons: [person],
});
assert.match(collection, /<meta name="robots" content="index,follow/);
assert.equal((collection.match(/<h1/g) || []).length, 1);
assert.match(collection, /ItemList/);
assert.match(collection, /이름·지역·인상착의로 검색하기/);
assert.match(collection, /href="\/missing\/type\/dementia"/);
assert.match(collection, /서울 지역에서 이름과 인상착의로 실종자를 검색/);
assert.match(collection, /현재 공개 수색 정보 307건/);
assert.match(collection, /최근 등록순 1건 표시/);
assert.match(collection, /지역별 실종자 현황/);
assert.match(collection, /data-seo-case-id="safe-182-case-1"/);
assert.match(collection, /seo_search_entry/);
assert.match(collection, /pageGroup:"region"/);
assertInlineScriptsParse(collection, 'collection');
const organicCollectionBeacons = runCollectionTracking(collection, 'https://www.google.com/search?q=서울+실종자');
assert.deepEqual(organicCollectionBeacons.map((beacon) => beacon.body.event), ['seo_search_entry', 'seo_detail_started']);
assert.equal(organicCollectionBeacons[0].body.pageGroup, 'region');
assert.equal(organicCollectionBeacons[1].body.caseId, person.id);
assert.equal(runCollectionTracking(collection, 'https://missingalert.kr/missing').length, 0);
assert.doesNotMatch(collection, /utm_(source|medium|campaign|content)/);

const nationwideGrid = seo.buildMissingPersonCollectionHtml({
  title: '전국 실종자 현황', description: '전국 공개 정보', canonicalPath: '/missing', eyebrow: '전국', persons: [person],
  linkSections: [{
    heading: '지역별 실종자 현황',
    links: seo.PUBLIC_REGIONS.map((region) => ({href: `/missing/region/${region.slug}`, label: `${region.name} 실종자 현황`})),
  }],
});
assert.equal((nationwideGrid.match(/href="\/missing\/region\//g) || []).length, 17);

const subRegionCollection = seo.buildMissingPersonCollectionHtml({
  title: '강서구 실종자 현황·검색 | 서울특별시', description: '강서구 공개 수색 정보',
  canonicalPath: '/missing/region/seoul/%EA%B0%95%EC%84%9C%EA%B5%AC', eyebrow: '강서구', persons: subRegionPersons,
});
assert.match(subRegionCollection, /강서구 실종자 현황/);
assert.match(subRegionCollection, /pageGroup:"region"/);
assert.match(subRegionCollection, /canonical" href="https:\/\/missingalert\.kr\/missing\/region\/seoul\/%EA%B0%95%EC%84%9C%EA%B5%AC"/);

assert.match(html, /href="https:\/\/missingalert\.kr\/missing">실종자 검색·조회/);
assert.match(html, /href="https:\/\/missingalert\.kr\/missing\/type\/dementia"/);

const emptyCollection = seo.buildMissingPersonCollectionHtml({
  title: '오늘 접수된 실종자 현황',
  description: '현재 공개 중인 정보입니다.',
  canonicalPath: '/missing/today',
  eyebrow: '오늘의 공개 수색 정보',
  persons: [],
});
assert.match(emptyCollection, /<meta name="robots" content="noindex,follow"/);

const normalizedUnknowns = seo.toPublicMissingPerson('unknown-values', {
  source: 'api', status: 'active', seoVisible: true, age: 0, height: '0', type: 'missing_child',
});
assert.equal(normalizedUnknowns.age, null);
assert.equal(normalizedUnknowns.height, null);
assert.equal(normalizedUnknowns.address, '');
const unknownHtml = seo.buildMissingPersonHtml(normalizedUnknowns);
assert.doesNotMatch(unknownHtml, /0cm|0세/);
assert.match(unknownHtml, /실종 당시 아동으로 분류/);
assert.doesNotMatch(unknownHtml, /대한민국|마지막 확인 지역|<span class="label">실종 발생 지역/);
assert.match(unknownHtml, /안전Dream 공개 분류/);
assert.match(unknownHtml, /안전Dream 현재 공개 중/);

const childHtml = seo.buildMissingPersonHtml({...person, type: 'missing_child', age: 52, ageAtMissing: 13});
assert.match(childHtml, /실종 당시 13세 · 현재 52세 추정/);
assert.match(seo.buildMissingPersonTitle({...person, type: 'missing_child', age: 52, ageAtMissing: 13}), /\(실종 당시 13세\)/);
assert.doesNotMatch(seo.buildMissingPersonTitle({...person, type: 'missing_child', age: 52, ageAtMissing: null}), /52세/);
const childCollection = seo.buildMissingPersonCollectionHtml({
  title: '실종아동 찾기', description: '실종아동 공개 정보', canonicalPath: '/missing/type/child',
  eyebrow: '실종아동 공개 수색 정보', persons: [{...person, type: 'missing_child', age: 52, ageAtMissing: 13}],
});
assert.match(childCollection, /<p>실종 당시 13세<\/p><p>현재 52세 추정<\/p>/);
const childUnknownAgeCollection = seo.buildMissingPersonCollectionHtml({
  title: '실종아동 찾기', description: '실종아동 공개 정보', canonicalPath: '/missing/type/child',
  eyebrow: '실종아동 공개 수색 정보', persons: [{...person, type: 'missing_child', age: 52, ageAtMissing: null}],
});
assert.match(childUnknownAgeCollection, /<p>현재 공개 연령 52세<\/p><p>실종 당시 아동으로 분류된 사건<\/p>/);
const recentPerson = {...person, missingDate: new Date().toISOString()};
const relatedHtml = seo.buildMissingPersonHtml(recentPerson, [], [{...person, id: 'related-case-1'}]);
assert.match(relatedHtml, /href="https:\/\/missingalert\.kr\/missing\/recent"/);
assert.match(relatedHtml, /같은 지역의 최근 공개 정보/);

const statistics = seo.buildMissingPersonStatisticsHtml([person]);
assert.match(statistics, /전체 신고 건수와 혼합하지 않습니다/);
assert.match(statistics, /서울특별시 <strong>1건/);
assert.match(statistics, /pageGroup:"statistics"/);
assert.match(statistics, /집계 기준: 안전Dream 공개 데이터의 최신 실제 변경/);
assert.match(statistics, /"dateModified":"2026-08-20T03:00:00.000Z"/);
assertInlineScriptsParse(statistics, 'statistics');

const rss = seo.buildMissingPersonsRss([person]);
assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?><rss version="2\.0">/);
assert.match(rss, /https:\/\/missingalert\.kr\/missing\/safe-182-case-1/);
assert.match(rss, /인상착의 및 특징: 회색 상의와 검은 바지/);
assert.match(rss, /공개 신장: 168cm/);
assert.match(rss, /경찰 112 또는 안전Dream 182/);
assert.doesNotMatch(rss, /utm_/);

assert.equal(seo.PUBLIC_GUIDES.length, 5);
const guide = seo.getPublicGuide('missing-report');
assert.ok(guide);
const guideHtml = seo.buildGuideHtml(guide);
assert.match(guideHtml, /실종 신고 방법과 신고 후 확인/);
assert.match(guideHtml, /href="tel:112"/);
assert.match(guideHtml, /href="tel:182"/);
assert.match(guideHtml, /#0182/);
assert.match(guideHtml, /경찰청 안전Dream 신고·처리 안내/);
assert.match(guideHtml, /최근 검토일: 2026년 8월 25일/);
assert.match(guideHtml, /pageGroup:"guide"/);
assertInlineScriptsParse(guideHtml, 'guide');
for (const publicGuide of seo.PUBLIC_GUIDES) {
  const publicGuideHtml = seo.buildGuideHtml(publicGuide);
  assert.match(publicGuideHtml, /href="\/missing\/type\/(?:child|dementia|disability)"/, `${publicGuide.slug} must link a related type hub`);
}

const regionEmbed = seo.buildRegionEmbedHtml(seo.getPublicRegion('seoul'), [person]);
assert.match(regionEmbed, /서울특별시 현재 공개 수색/);
assert.match(regionEmbed, /<meta name="robots" content="noindex,follow,noarchive"/);
assert.match(regionEmbed, /서울특별시 전체 정보 확인/);
assert.match(regionEmbed, /공식 기관 제휴·보증 표시는 아닙니다/);
assert.equal((regionEmbed.match(/<h1/g) || []).length, 1);

const sitemap = seo.buildMissingPersonsSitemap([person]);
assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?><urlset/);
assert.match(sitemap, /https:\/\/missingalert\.kr\/missing\/safe-182-case-1/);
assert.match(sitemap, /<lastmod>2026-08-20T03:00:00\.000Z<\/lastmod>/);
const sitemapIndex = seo.buildSitemapIndex(['/sitemaps/public-cases-1.xml']);
assert.match(sitemapIndex, /<sitemapindex/);
assert.match(sitemapIndex, /public-cases-1\.xml/);
assert.match(seo.buildGoneHtml(), /noindex,nofollow,noarchive/);

const firebaseConfig = JSON.parse(await readFile(path.join(repoRoot, 'firebase.json'), 'utf8'));
const rewriteSources = firebaseConfig.hosting.rewrites.map((rewrite) => rewrite.source);
assert.ok(rewriteSources.includes('/rss.xml'));
assert.ok(rewriteSources.includes('/guide/**'));
assert.ok(rewriteSources.includes('/embed/**'));
const indexHtml = await readFile(path.join(repoRoot, 'frontend', 'public', 'index.html'), 'utf8');
assert.match(indexHtml, /<title>MissingAlert \| 실종자 공식정보·지도·제보<\/title>/);
assert.doesNotMatch(indexHtml, /<title>실종자 현황·검색·지도/);
assert.match(indexHtml, /<h1>전국 실종자 공개정보·지도·제보<\/h1>/);
assert.match(indexHtml, /href="\/missing\/recent"/);
assert.match(indexHtml, /href="https:\/\/missingalert\.kr\/rss\.xml"/);
assert.match(indexHtml, /event: 'seo_search_entry'/);
assert.match(indexHtml, /pageGroup: 'home'/);
assertInlineScriptsParse(indexHtml, 'home');
const functionsIndex = await readFile(path.join(repoRoot, 'functions', 'src', 'index.ts'), 'utf8');
assert.match(functionsIndex, /SEO_COLLECTION_PAGE_SIZE = 24/);
assert.doesNotMatch(functionsIndex, /const persons = (?:allPersons|recentPersons)\.slice\(0, 100\)/);
assert.match(functionsIndex, /app\.get\("\/api\/admin\/seo-metrics", requireAdmin/);
assert.match(functionsIndex, /app\.get\("\/rss\.xml"[\s\S]*?s-maxage=300/);
assert.match(functionsIndex, /normalizeSeoSource\(req\.body\?\.source\)/);
assert.match(functionsIndex, /Cache-Control", "private, no-store"/);
assert.match(functionsIndex, /app\.get\("\/embed\/region\/:regionSlug"/);
assert.match(functionsIndex, /frame-ancestors \*/);
assert.match(functionsIndex, /app\.get\("\/missing\/region\/:regionSlug\/:subRegionSlug"/);
assert.match(functionsIndex, /buildPublicSubRegionCandidates\(persons\).*publicSubRegionPath/s);
assert.match(functionsIndex, /const meaningfulChange = !existingSnapshots\[index\]\?\.exists \|\| previousFingerprint !== item\.contentFingerprint/);
assert.match(functionsIndex, /if \(!meaningfulChange\) continue;[\s\S]*?sourceLastSeenAt: FieldValue\.serverTimestamp\(\)/);
assert.match(functionsIndex, /previousSnapshotFingerprint === snapshotFingerprint[\s\S]*?문서 동기화 생략/);

const metricDay = seoMetrics.normalizeSeoMetricDay('2026-08-24', {
  totals: {seo_detail_view: 100, seo_app_cta_click: 12, share_started: 4, report_started: 2, call_112_click: 1, call_182_click: 3, seo_return_visit: 7, seo_search_entry: 100, seo_detail_started: 45},
  sources: {google: {seo_search_entry: 60}, naver: {seo_search_entry: 30}, bing: {seo_search_entry: 5}, daum: {seo_search_entry: 5}},
  pageGroups: {home: {seo_search_entry: 35}, nationwide: {seo_search_entry: 10}, region: {seo_search_entry: 15}, type: {seo_search_entry: 10}, recent: {seo_search_entry: 10}, statistics: {seo_search_entry: 8}, guide: {seo_search_entry: 7}, detail: {seo_search_entry: 5}},
});
assert.equal(metricDay.searchEntries, 100);
assert.equal(metricDay.detailStarts, 45);
const metricSummary = seoMetrics.buildSeoMetricsSummary([metricDay], 28, '2026-07-28', '2026-08-24');
assert.equal(metricSummary.totals.detailViews, 100);
assert.equal(metricSummary.rates.mapViewRate, 12);
assert.equal(metricSummary.rates.shareRate, 4);
assert.equal(metricSummary.rates.reportStartRate, 2);
assert.equal(metricSummary.rates.callRate, 4);
assert.equal(metricSummary.rates.searchToDetailRate, 45);
assert.equal(metricSummary.totals.returnVisits, 7);
assert.equal(metricSummary.rates.returnVisitRate, 7);
assert.equal(metricSummary.rates.homeSearchShare, 35);
assert.equal(metricSummary.rates.expansionSearchShare, 35);
assert.equal(seoMetrics.normalizeSeoSource('unexpected-source'), 'other');
assert.equal(seoMetrics.normalizeSeoPageGroup('unexpected-page'), 'other');

if (process.argv.includes('--fixtures')) {
  const fixtureDir = path.join(repoRoot, 'artifacts', 'seo-run');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(path.join(fixtureDir, 'case-detail.html'), html, 'utf8');
  await writeFile(path.join(fixtureDir, 'region-seoul.html'), collection, 'utf8');
}

console.log('SEO contract checks passed');
