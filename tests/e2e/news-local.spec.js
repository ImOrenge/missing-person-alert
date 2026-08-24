const { test, expect } = require('@playwright/test');

const baseURL = process.env.NEWS_TEST_BASE_URL || 'http://127.0.0.1:4173';

const newsItems = Array.from({ length: 22 }, (_, index) => ({
  id: `article-${index + 1}`,
  title: `<b>실종</b>자 관련 뉴스 ${index + 1}`,
  originallink: `https://example.com/news/${index + 1}`,
  link: `https://news.naver.com/article/${index + 1}`,
  description: `실종자 관련 <b>검색</b> 결과 ${index + 1}입니다.`,
  pubDate: new Date(Date.UTC(2026, 7, 20, 10, index)).toUTCString(),
}));

async function mockNewsApi(page) {
  await page.route('**/api/news**', async (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit') || 20);
    const cursor = url.searchParams.get('cursor');
    const start = cursor === 'next-page' ? 20 : 0;
    const items = newsItems.slice(start, start + limit);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        source: 'NAVER_API_HUB',
        sourceLabel: 'NAVER 검색 결과',
        mode: 'HISTORY_CACHE',
        query: '실종',
        retentionDays: 20,
        items,
        nextCursor: start + items.length < newsItems.length ? 'next-page' : null,
      }),
    });
  });
}

async function mockCaseNewsApi(page, caseId = 'test-case') {
  await page.route(`**/api/missing-persons/${caseId}/news-search**`, async (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit') || 20);
    const cursor = url.searchParams.get('cursor');
    const start = cursor === '21' ? 20 : 0;
    const items = newsItems.slice(start, start + limit);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        source: 'NAVER_API_HUB',
        sourceLabel: 'NAVER 검색 결과',
        mode: 'CASE_CONTEXT_SEARCH',
        query: '홍길동 실종',
        queries: ['홍길동 실종', '홍길동 서울특별시 강남구 실종', '홍길동 파란색 점퍼 검은색 바지 실종'],
        searchCriteria: {
          name: '홍길동',
          region: '서울특별시 강남구',
          appearance: '파란색 점퍼 검은색 바지',
        },
        retentionDays: 0,
        associationStored: false,
        caseContext: {
          id: caseId,
          name: '홍길동',
          verification: 'UNVERIFIED_SEARCH_RESULTS',
        },
        items,
        nextCursor: start + items.length < newsItems.length ? '21' : null,
      }),
    });
  });
}

test('dashboard summary links to the separate news page', async ({ page }) => {
  await mockNewsApi(page);
  await page.goto(baseURL);

  const summary = page.locator('[data-naver-search-results]').filter({ hasText: '실종자 관련 최신 뉴스' });
  await expect(summary).toBeVisible();
  await expect(summary.locator('li')).toHaveCount(5);
  await expect(summary).not.toContainText('<b>');

  await summary.getByRole('button', { name: '전체 뉴스 보기' }).click();
  await expect(page).toHaveURL(`${baseURL}/news`);
  await expect(page.getByRole('heading', { name: 'NAVER 뉴스 검색 결과' })).toBeVisible();
  await expect(page.locator('[data-naver-search-results] li')).toHaveCount(20);

  await page.getByRole('button', { name: '뉴스 더 보기' }).click();
  await expect(page.locator('[data-naver-search-results] li')).toHaveCount(22);
  await expect(page.getByRole('button', { name: '뉴스 더 보기' })).toHaveCount(0);

  const sourceLink = page.locator('[data-naver-search-results] li').first().getByRole('link', { name: /새 창에서 원문 열기/ });
  await expect(sourceLink).toHaveAttribute('target', '_blank');
  await expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');

  await page.getByLabel('시작일').fill('2026-08-01');
  await page.getByRole('button', { name: '적용' }).click();
  await expect(page).toHaveURL(/\/news\?from=2026-08-01/);
});

test('mobile menu adds news without expanding the five-item bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNewsApi(page);
  await page.goto(baseURL);

  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('button', { name: '관련 뉴스' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '모바일 빠른 메뉴' }).getByRole('button')).toHaveCount(5);
});

test('case-context news search is explicitly unverified and never presented as a stored match', async ({ page }) => {
  await mockCaseNewsApi(page);
  await page.goto(`${baseURL}/news?caseId=test-case`);

  await expect(page.getByRole('heading', { name: '홍길동님의 공식 단서로 검색 중' })).toBeVisible();
  await expect(page.getByRole('list', { name: '뉴스 검색에 사용한 공식 단서' })).toContainText('서울특별시 강남구');
  await expect(page.getByRole('list', { name: '뉴스 검색에 사용한 공식 단서' })).toContainText('파란색 점퍼 검은색 바지');
  await expect(page.getByText(/자동 판정하거나 연결 정보를 저장하지 않습니다/)).toBeVisible();
  await expect(page.getByRole('form', { name: '뉴스 기간 필터' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '실종자 이름·지역·인상착의 NAVER 뉴스 검색 결과' })).toBeVisible();
  await expect(page.locator('[data-naver-search-results] li')).toHaveCount(20);

  await page.getByRole('button', { name: '뉴스 더 보기' }).click();
  await expect(page.locator('[data-naver-search-results] li')).toHaveCount(22);
  await page.getByRole('button', { name: '전체 뉴스' }).click();
  await expect(page).toHaveURL(`${baseURL}/news`);
});
