import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const seo = require('../functions/lib/missingPersonSeo.js');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const person = {
  id: 'safe-182-case-1',
  name: '김○○',
  age: 72,
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
assert.match(html, /\/map\?personId=safe-182-case-1&amp;utm_source=organic/);
assert.match(html, /data-seo-event="seo_app_cta_click"/);
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
  persons: [person],
});
assert.match(collection, /<meta name="robots" content="index,follow/);
assert.equal((collection.match(/<h1/g) || []).length, 1);
assert.match(collection, /ItemList/);
assert.match(collection, /이름·지역·인상착의로 검색하기/);
assert.match(collection, /href="\/missing\/type\/dementia"/);
assert.match(collection, /서울 지역에서 이름과 인상착의로 실종자를 검색/);

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

const sitemap = seo.buildMissingPersonsSitemap([person]);
assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?><urlset/);
assert.match(sitemap, /https:\/\/missingalert\.kr\/missing\/safe-182-case-1/);
const sitemapIndex = seo.buildSitemapIndex(['/sitemaps/public-cases-1.xml']);
assert.match(sitemapIndex, /<sitemapindex/);
assert.match(sitemapIndex, /public-cases-1\.xml/);
assert.match(seo.buildGoneHtml(), /noindex,nofollow,noarchive/);

if (process.argv.includes('--fixtures')) {
  const fixtureDir = path.join(repoRoot, 'artifacts', 'seo-run');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(path.join(fixtureDir, 'case-detail.html'), html, 'utf8');
  await writeFile(path.join(fixtureDir, 'region-seoul.html'), collection, 'utf8');
}

console.log('SEO contract checks passed');
