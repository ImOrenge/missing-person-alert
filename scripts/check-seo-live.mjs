import process from 'node:process';

const DEFAULT_ORIGIN = 'https://missingalert.kr';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const NAVERBOT_UA = 'Yeti/1.1 (+http://help.naver.com/robots/)';
const REGION_SLUGS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk',
  'gyeongnam', 'jeju',
];
const GUIDE_PATHS = [
  '/guide/missing-report',
  '/guide/missing-alert-message',
  '/guide/missing-child-response',
  '/guide/dementia-missing-response',
  '/guide/report-sighting',
];
const ENDED_CASE_SAMPLE_PATH = '/missing/6158970';

const normalizeOrigin = (value) => String(value || DEFAULT_ORIGIN).replace(/\/+$/, '');
const origin = normalizeOrigin(process.env.SEO_LIVE_ORIGIN || process.argv[2]);
const cacheBust = String(process.env.SEO_LIVE_CACHE_BUST || '').trim();
const failures = [];
const evidence = [];

const check = (condition, label, details = '') => {
  if (condition) {
    evidence.push({ label, passed: true });
    return;
  }
  failures.push(`${label}${details ? `: ${details}` : ''}`);
  evidence.push({ label, passed: false, details });
};

const request = async (path, userAgent = GOOGLEBOT_UA) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const requestUrl = new URL(path, `${origin}/`);
      if (cacheBust) requestUrl.searchParams.set('__seo_check', cacheBust);
      const response = await fetch(requestUrl, {
        headers: { 'user-agent': userAgent, connection: 'close' },
        redirect: 'follow',
        signal: controller.signal,
      });
      return {
        body: await response.text(),
        headers: response.headers,
        status: response.status,
        url: response.url,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${path}: ${message}`);
};

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapEntries = (xml) => [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g)]
  .map((match) => ({ url: match[1].trim(), lastmod: (match[2] || '').trim() }));
const canonical = (html) => html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] || '';
const title = (html) => html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
const header = (response, name) => response.headers.get(name) || '';
const isIndexable = (response) => /(?:^|\s|,)index(?:\s|,|$)/i.test(header(response, 'x-robots-tag'))
  && !/noindex/i.test(header(response, 'x-robots-tag'));

const mapWithConcurrency = async (items, concurrency, worker) => {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
};

const run = async () => {
  const indexableRegionSlugs = [];
  const ineligibleRegionSlugs = [];
  const regionBodies = new Map();
  const home = await request('/');
  check(home.status === 200, 'home returns 200', `status=${home.status}`);
  check(title(home.body) === 'MissingAlert | 실종자 공식정보·지도·제보', 'home initial title owns the brand/service intent', title(home.body));
  check(canonical(home.body) === `${origin}/`, 'home has a self canonical', canonical(home.body));
  for (const path of ['/missing', '/missing/recent', '/missing/statistics', '/map', '/guide/missing-report', '/guide/report-sighting']) {
    check(home.body.includes(`href="${path}"`), `home links ${path}`);
  }

  const hub = await request('/missing');
  check(hub.status === 200, '/missing returns 200', `status=${hub.status}`);
  check(isIndexable(hub), '/missing is indexable', header(hub, 'x-robots-tag'));
  check(title(hub.body).includes('실종자'), '/missing has a focused title', title(hub.body));
  const hubPersonCards = (hub.body.match(/class="person-card"/g) || []).length;
  check(hubPersonCards > 0 && hubPersonCards <= 24, '/missing renders at most 24 mobile-friendly person cards', `count=${hubPersonCards}`);
  const missingRegionLinks = REGION_SLUGS.filter((slug) => !hub.body.includes(`/missing/region/${slug}`));
  check(missingRegionLinks.length === 0, '/missing links all 17 regions', missingRegionLinks.join(','));
  check(!/utm_(?:source|medium|campaign|content)=/i.test(hub.body), '/missing has no internal UTM links');
  check(hub.body.includes('실종 발생 지역') && !hub.body.includes('마지막 확인 위치'), '/missing describes the official occurrence address without calling it a last-seen location');

  const childType = await request('/missing/type/child');
  const childCaseIds = [...childType.body.matchAll(/data-seo-case-id="([^"]+)"/g)].map((match) => match[1]);
  check(childType.status === 200, '/missing/type/child returns 200', `status=${childType.status}`);
  check(isIndexable(childType), '/missing/type/child is indexable', header(childType, 'x-robots-tag'));
  check(canonical(childType.body) === `${origin}/missing/type/child`, '/missing/type/child has a self canonical', canonical(childType.body));
  check(childCaseIds.length > 0, '/missing/type/child renders public case cards', `count=${childCaseIds.length}`);
  check(!/<p>실종 당시 \d+세 · 현재 \d+세 추정<\/p>/.test(childType.body), 'child cards separate age-at-missing from current estimated age');
  await mapWithConcurrency(childCaseIds.slice(0, 3), 2, async (caseId) => {
    const response = await request(`/missing/${encodeURIComponent(caseId)}`);
    check(response.status === 200, `child detail ${caseId} returns 200`, `status=${response.status}`);
    check(!/0cm|<span class="label">마지막 확인 지역<\/span>/.test(response.body), `child detail ${caseId} hides zero height and does not mislabel occurrence location`);
    check(/<span class="label">안전Dream 공개 분류<\/span>실종 아동/.test(response.body), `child detail ${caseId} identifies the official public classification`);
    check(/<span class="label">공개 상태<\/span>안전Dream 현재 공개 중/.test(response.body), `child detail ${caseId} identifies the official public status`);
    check(/정보 실제 변경:/.test(response.body), `child detail ${caseId} exposes the meaningful update timestamp`);
  });

  for (const path of ['/missing/recent', '/missing/statistics', ...GUIDE_PATHS]) {
    const response = await request(path);
    check(response.status === 200, `${path} returns 200`, `status=${response.status}`);
    check(isIndexable(response), `${path} is indexable`, header(response, 'x-robots-tag'));
    check(canonical(response.body) === `${origin}${path}`, `${path} has a self canonical`, canonical(response.body));
    if (path === '/missing/statistics') {
      check(response.body.includes('집계 기준: 안전Dream 공개 데이터의 최신 실제 변경'), '/missing/statistics exposes its live snapshot basis');
      check(/"dateModified":"[^"]+"/.test(response.body), '/missing/statistics exposes Dataset dateModified');
    }
    if (path.startsWith('/guide/')) {
      check(/href="\/missing\/type\/(?:child|dementia|disability)"/.test(response.body), `${path} links a related type hub`);
      check(response.body.includes('최근 검토일: 2026년 8월 25일'), `${path} exposes the current review date`);
    }
  }

  const robots = await request('/robots.txt');
  check(robots.status === 200, '/robots.txt returns 200', `status=${robots.status}`);
  check(robots.body.includes(`${origin}/sitemap-missing-persons.xml`), 'robots declares the dynamic parent sitemap');

  const staticSitemap = await request('/sitemap.xml');
  const staticSitemapUrls = locs(staticSitemap.body);
  check(staticSitemap.status === 200, 'static sitemap returns 200', `status=${staticSitemap.status}`);
  check(/application\/xml/i.test(header(staticSitemap, 'content-type')), 'static sitemap is XML', header(staticSitemap, 'content-type'));
  check(staticSitemapUrls.includes(`${origin}/`), 'static sitemap contains the canonical home URL');
  check(staticSitemapUrls.includes(`${origin}/map`), 'static sitemap contains the canonical map URL');
  check(!/utm_(?:source|medium|campaign|content)=/i.test(staticSitemap.body), 'static sitemap has no UTM links');

  const sitemapIndex = await request('/sitemap-missing-persons.xml');
  check(sitemapIndex.status === 200, 'dynamic sitemap index returns 200', `status=${sitemapIndex.status}`);
  check(/application\/xml/i.test(header(sitemapIndex, 'content-type')), 'dynamic sitemap index is XML', header(sitemapIndex, 'content-type'));
  const sitemapChildren = locs(sitemapIndex.body);
  const expectedChildren = [
    `${origin}/sitemaps/missing-collections.xml`,
    `${origin}/sitemaps/missing-guides.xml`,
  ];
  for (const child of expectedChildren) check(sitemapChildren.includes(child), `sitemap index includes ${child}`);
  const caseSitemapUrl = sitemapChildren.find((url) => /\/sitemaps\/public-cases-\d+\.xml$/.test(url));
  check(Boolean(caseSitemapUrl), 'sitemap index includes a public case sitemap');

  const collections = await request('/sitemaps/missing-collections.xml');
  const collectionUrls = locs(collections.body);
  check(collections.status === 200, 'collection sitemap returns 200', `status=${collections.status}`);
  for (const slug of REGION_SLUGS) {
    const regionPath = `/missing/region/${slug}`;
    const regionResponse = await request(regionPath);
    const regionUrl = `${origin}${regionPath}`;
    regionBodies.set(slug, regionResponse.body);
    check(regionResponse.status === 200, `${regionPath} returns 200`, `status=${regionResponse.status}`);
    check(canonical(regionResponse.body) === regionUrl, `${regionPath} has a self canonical`, canonical(regionResponse.body));
    check(!regionResponse.body.includes('마지막 확인 지역'), `${regionPath} does not mislabel the occurrence address as a last-seen location`);
    if (isIndexable(regionResponse)) {
      indexableRegionSlugs.push(slug);
      check(collectionUrls.includes(regionUrl), `indexable region ${slug} is in the collection sitemap`);
    } else {
      ineligibleRegionSlugs.push(slug);
      check(/noindex/i.test(header(regionResponse, 'x-robots-tag')), `ineligible region ${slug} is noindex`, header(regionResponse, 'x-robots-tag'));
      check(!collectionUrls.includes(regionUrl), `ineligible region ${slug} is excluded from the collection sitemap`);
    }
  }
  check(collectionUrls.includes(`${origin}/missing/recent`), 'collection sitemap includes recent');
  check(collectionUrls.includes(`${origin}/missing/statistics`), 'collection sitemap includes statistics');
  const subRegionUrls = collectionUrls.filter((url) => /\/missing\/region\/[^/]+\/[^/]+$/.test(url));
  check(subRegionUrls.length === 10, 'collection sitemap contains exactly 10 pilot subregions', `count=${subRegionUrls.length}`);
  await mapWithConcurrency(subRegionUrls, 2, async (subRegionUrl) => {
    const subRegionPath = new URL(subRegionUrl).pathname;
    const [, , , regionSlug, encodedSubRegion] = subRegionPath.split('/');
    const subRegionName = decodeURIComponent(encodedSubRegion || '');
    const parentPath = `/missing/region/${regionSlug}`;
    const response = await request(subRegionPath);
    const caseIds = [...response.body.matchAll(/data-seo-case-id="([^"]+)"/g)].map((match) => match[1]);
    const uniqueCaseIds = new Set(caseIds);
    check(response.status === 200, `${subRegionPath} returns 200`, `status=${response.status}`);
    check(isIndexable(response), `${subRegionPath} is indexable`, header(response, 'x-robots-tag'));
    check(canonical(response.body) === subRegionUrl, `${subRegionPath} has a self canonical`, canonical(response.body));
    check(title(response.body).includes(`${subRegionName} 실종자 현황·검색`), `${subRegionPath} has a local-intent title`, title(response.body));
    check(caseIds.length >= 3 && caseIds.length <= 24, `${subRegionPath} has 3 to 24 eligible case cards`, `count=${caseIds.length}`);
    check(uniqueCaseIds.size === caseIds.length, `${subRegionPath} has unique case cards`, `unique=${uniqueCaseIds.size}, total=${caseIds.length}`);
    check(response.body.includes(`href="${parentPath}"`), `${subRegionPath} links its parent region`);
    check(regionBodies.get(regionSlug)?.includes(`href="${subRegionPath}"`), `${parentPath} links pilot ${subRegionName}`);
    check(response.body.includes('현재 활성 공식 사건이 3건 이상인 하위 지역만 파일럿 검색 페이지로 제공합니다.'), `${subRegionPath} explains the pilot eligibility rule`);
    check(!/utm_(?:source|medium|campaign|content)=/i.test(response.body), `${subRegionPath} has no internal UTM links`);
  });

  const guides = await request('/sitemaps/missing-guides.xml');
  const guideUrls = locs(guides.body);
  check(guides.status === 200, 'guide sitemap returns 200', `status=${guides.status}`);
  for (const path of GUIDE_PATHS) check(guideUrls.includes(`${origin}${path}`), `guide sitemap includes ${path}`);

  let publicCaseSitemapBody = '';
  if (caseSitemapUrl) {
    const caseMapPath = new URL(caseSitemapUrl).pathname;
    const caseMap = await request(caseMapPath);
    publicCaseSitemapBody = caseMap.body;
    const entries = sitemapEntries(caseMap.body);
    const entryUrls = entries.map((entry) => entry.url);
    const parsedLastmods = entries.map((entry) => Date.parse(entry.lastmod));
    const caseUrl = entryUrls.find((url) => /^https:\/\/missingalert\.kr\/missing\/\d+$/.test(url));
    check(caseMap.status === 200, 'public case sitemap returns 200', `status=${caseMap.status}`);
    check(Boolean(caseUrl), 'public case sitemap contains a canonical case URL');
    check(entries.length > 0 && entries.length <= 1000, 'public case sitemap contains 1 to 1,000 entries', `count=${entries.length}`);
    check(new Set(entryUrls).size === entryUrls.length, 'public case sitemap URLs are unique', `unique=${new Set(entryUrls).size}, total=${entryUrls.length}`);
    check(entries.every((entry) => Boolean(entry.lastmod)), 'every public case sitemap entry has lastmod');
    check(parsedLastmods.every((value) => Number.isFinite(value)), 'every public case lastmod is a valid date');
    check(parsedLastmods.every((value) => value <= Date.now() + 5 * 60 * 1000), 'public case sitemap has no future lastmod');
    check(Buffer.byteLength(caseMap.body, 'utf8') < 50 * 1024 * 1024, 'public case sitemap is smaller than 50MB', `bytes=${Buffer.byteLength(caseMap.body, 'utf8')}`);
    const repeatedCaseMap = await request(caseMapPath);
    check(repeatedCaseMap.body === caseMap.body, 'public case lastmod values are stable across unchanged reads');
    const sampleEntries = [...new Map([
      entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1),
    ].filter(Boolean).map((entry) => [entry.url, entry])).values()];
    await mapWithConcurrency(sampleEntries, 2, async (entry) => {
      const response = await request(new URL(entry.url).pathname);
      check(response.status === 200, `${entry.url} lastmod sample returns 200`, `status=${response.status}`);
      check(response.body.includes(`"dateModified":"${entry.lastmod}"`), `${entry.url} sitemap lastmod matches detail dateModified`, entry.lastmod);
    });
    if (caseUrl) {
      const caseResponse = await request(new URL(caseUrl).pathname);
      check(caseResponse.status === 200, 'sample public case returns 200', `status=${caseResponse.status}`);
      check(isIndexable(caseResponse), 'sample public case is indexable', header(caseResponse, 'x-robots-tag'));
      check(canonical(caseResponse.body) === caseUrl, 'sample public case has a self canonical', canonical(caseResponse.body));
      check(!/utm_(?:source|medium|campaign|content)=/i.test(caseResponse.body), 'sample public case has no internal UTM links');
    }
  }

  const missingCase = await request('/missing/999999999999');
  check(missingCase.status === 404, 'unknown case returns 404', `status=${missingCase.status}`);
  check(/noindex/i.test(header(missingCase, 'x-robots-tag')), 'unknown case is noindex', header(missingCase, 'x-robots-tag'));

  const endedCase = await request(ENDED_CASE_SAMPLE_PATH);
  check(endedCase.status === 410 || endedCase.status === 404, 'ended case returns 410 or 404', `status=${endedCase.status}`);
  check(/noindex/i.test(header(endedCase, 'x-robots-tag')), 'ended case is noindex', header(endedCase, 'x-robots-tag'));
  check(!publicCaseSitemapBody.includes(ENDED_CASE_SAMPLE_PATH), 'ended case is excluded from the public case sitemap');

  const rss = await request('/rss.xml', NAVERBOT_UA);
  check(rss.status === 200, 'RSS returns 200', `status=${rss.status}`);
  check(/application\/rss\+xml/i.test(header(rss, 'content-type')), 'RSS has the RSS content type', header(rss, 'content-type'));
  check(/<rss[\s>]/i.test(rss.body), 'RSS body is an RSS document');
  check(!/utm_(?:source|medium|campaign|content)=/i.test(rss.body), 'RSS has no UTM links');
  check(rss.body.includes(`<link>${origin}/missing/recent</link>`), 'RSS channel links the recent hub');
  const rssItems = [...rss.body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  check(rssItems.length > 0 && rssItems.length <= 50, 'RSS contains 1 to 50 items', `count=${rssItems.length}`);
  const rssLinks = rssItems.map((item) => item.match(/<link>([^<]+)<\/link>/)?.[1] || '');
  check(rssLinks.every((url) => /^https:\/\/missingalert\.kr\/missing\/\d+$/.test(url)), 'RSS items use canonical public case URLs');
  check(new Set(rssLinks).size === rssLinks.length, 'RSS item URLs are unique');
  check(!rss.body.includes(ENDED_CASE_SAMPLE_PATH), 'ended case is excluded from RSS');
  const rssDates = rssItems.map((item) => item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || '');
  check(rssDates.every((value) => Number.isFinite(Date.parse(value))), 'RSS item dates are valid RFC-compatible dates');
  check(Buffer.byteLength(rss.body, 'utf8') < 10 * 1024 * 1024, 'RSS is smaller than Naver\'s 10MB submission limit', `bytes=${Buffer.byteLength(rss.body, 'utf8')}`);
  check(rssItems.every((item) => /<description>[^<]*인상착의 및 특징:[^<]*경찰 112 또는 안전Dream 182[^<]*<\/description>/.test(item)), 'RSS items include the complete public summary for Naver');

  const widget = await request('/embed/region/seoul');
  check(widget.status === 200, 'region widget returns 200', `status=${widget.status}`);
  check(/noindex/i.test(header(widget, 'x-robots-tag')), 'region widget is noindex', header(widget, 'x-robots-tag'));
  check(/frame-ancestors \*/i.test(header(widget, 'content-security-policy')), 'region widget allows embedding', header(widget, 'content-security-policy'));
  check(widget.body.includes(`${origin}/missing/region/seoul`), 'region widget links the canonical regional hub');

  const admin = await request('/api/admin/seo-metrics');
  check(admin.status === 401 || admin.status === 403, 'SEO metrics API rejects anonymous access', `status=${admin.status}`);

  const summary = {
    checkedAt: new Date().toISOString(),
    origin,
    passed: evidence.filter((item) => item.passed).length,
    failed: failures.length,
    failures,
    regionEligibility: {
      total: REGION_SLUGS.length,
      indexable: indexableRegionSlugs.length,
      ineligible: ineligibleRegionSlugs.length,
      indexableSlugs: indexableRegionSlugs,
      ineligibleSlugs: ineligibleRegionSlugs,
      note: 'Search Console exposure is a separate outcome metric; this reports current live index eligibility only.',
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error(JSON.stringify({ origin, fatal: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
