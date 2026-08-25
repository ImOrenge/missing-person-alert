import { chromium } from '@playwright/test';
import process from 'node:process';

const origin = String(process.env.SEO_LIVE_ORIGIN || 'https://missingalert.kr').replace(/\/+$/, '');
const failures = [];
const evidence = [];

const check = (condition, label, details = '') => {
  evidence.push({ label, passed: Boolean(condition), details: condition ? undefined : details });
  if (!condition) failures.push(`${label}${details ? `: ${details}` : ''}`);
};

const sitemap = await fetch(`${origin}/sitemaps/public-cases-1.xml`).then(async (response) => ({
  status: response.status,
  body: await response.text(),
}));
check(sitemap.status === 200, 'public case sitemap returns 200', `status=${sitemap.status}`);
const sampleCaseUrl = sitemap.body.match(/<loc>(https:\/\/missingalert\.kr\/missing\/[^<]+)<\/loc>/)?.[1];
check(Boolean(sampleCaseUrl), 'public case sitemap provides a sample detail URL');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Mobile Safari/537.36',
});

const routes = [
  { path: '/missing', expected: '실종자 검색·조회·찾기', aboveFoldCta: '이름·지역·인상착의로 검색하기' },
  { path: '/missing/recent', expected: '최근 실종자 현황', aboveFoldCta: '이름·지역·인상착의로 검색하기' },
  { path: '/missing/statistics', expected: '현재 공개 수색 정보 현황' },
  { path: '/guide/missing-report', expected: '실종 신고 방법과 신고 후 확인' },
  ...(sampleCaseUrl ? [{ path: new URL(sampleCaseUrl).pathname, expected: '찾습니다', detail: true }] : []),
];

try {
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const response = await page.goto(`${origin}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    check(response?.status() === 200, `${route.path} returns 200 on mobile`, `status=${response?.status()}`);
    const layout = await page.evaluate(() => ({
      h1Count: document.querySelectorAll('h1').length,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyText: document.body.innerText,
    }));
    check(layout.h1Count === 1, `${route.path} has exactly one H1`, `count=${layout.h1Count}`);
    check(layout.bodyText.includes(route.expected), `${route.path} contains its primary mobile intent`, route.expected);
    check(layout.scrollWidth <= layout.viewportWidth, `${route.path} has no horizontal overflow`, `${layout.scrollWidth}>${layout.viewportWidth}`);
    check(consoleErrors.length === 0, `${route.path} has no browser console errors`, consoleErrors.join(' | '));

    if (route.aboveFoldCta) {
      const cta = page.getByRole('link', { name: route.aboveFoldCta }).first();
      const box = await cta.boundingBox();
      check(Boolean(box), `${route.path} exposes the primary search CTA`);
      if (box) {
        check(box.height >= 44, `${route.path} primary CTA is at least 44px high`, `height=${box.height}`);
        check(box.y < 844, `${route.path} primary CTA appears above the fold`, `y=${box.y}`);
      }
    }

    if (route.detail) {
      for (const label of ['이 사건에 온라인 제보', '공식 페이지 공유', '경찰 112 전화', '안전Dream 182 전화']) {
        check(await page.getByText(label, { exact: true }).count() > 0, `${route.path} exposes ${label}`);
      }
      const sticky = page.getByRole('link', { name: '지도에서 바로 확인' });
      const box = await sticky.boundingBox();
      check(Boolean(box), `${route.path} exposes the sticky map CTA`);
      if (box) {
        check(box.height >= 44, `${route.path} sticky map CTA is at least 44px high`, `height=${box.height}`);
        check(box.y >= 0 && box.y + box.height <= 844, `${route.path} sticky map CTA is visible in the viewport`, `y=${box.y}`);
      }
    }
    await page.close();
  }

  if (sampleCaseUrl) {
    const page = await context.newPage();
    const sampleCaseId = new URL(sampleCaseUrl).pathname.split('/').at(-1);
    const duplicateUrl = `${origin}/map?personId=${encodeURIComponent(sampleCaseId)}&utm_source=organic&utm_medium=seo&utm_campaign=missing_detail&utm_content=primary_cta`;
    const response = await page.goto(duplicateUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    check(response?.status() === 200, 'legacy UTM map deep link returns 200', `status=${response?.status()}`);
    await page.waitForFunction(() => !window.location.search.includes('utm_'), undefined, { timeout: 10_000 });
    const state = await page.evaluate(() => ({
      url: window.location.href,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      personId: new URLSearchParams(window.location.search).get('personId'),
    }));
    check(!state.url.includes('utm_'), 'legacy UTM parameters are removed from the rendered URL', state.url);
    check(state.personId === sampleCaseId, 'legacy UTM cleanup preserves the personId deep link', state.personId || 'missing');
    check(/noindex/i.test(state.robots), 'functional map deep link renders noindex', state.robots);
    check(state.canonical === `${origin}/map`, 'functional map deep link canonicalizes to /map', state.canonical);
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  origin,
  viewport: { width: 390, height: 844 },
  passed: evidence.filter((item) => item.passed).length,
  failed: failures.length,
  failures,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
