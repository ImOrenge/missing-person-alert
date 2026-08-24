const { test, expect } = require('@playwright/test');
const path = require('path');

test.use({
  baseURL: 'https://localhost:3000',
  ignoreHTTPSErrors: true,
});

const enabledFlags = {
  emergency_banner_v2_enabled: true,
  dashboard_v2_enabled: true,
  mobile_nav_v2_enabled: true,
  unified_search_enabled: true,
  unified_explorer_enabled: true,
  reports_map_layer_enabled: true,
  case_detail_v2_enabled: true,
  reporting_flow_v2_enabled: true,
  reports_submission_enabled: true,
  reports_media_enabled: true,
  reports_admin_enabled: true,
  reports_public_timeline_enabled: true,
  dashboard_personalization_enabled: true,
  admin_banner_v2_enabled: true,
};

const publicBanner = {
  id: 'local-emergency',
  kind: 'emergency',
  severity: 'critical',
  title: '긴급 실종 알림',
  summary: '서울 중구 인근 제보를 확인하고 안전한 범위에서 협조해 주세요.',
  sourceLabel: '실종자알림 운영팀',
  targetRegionCodes: [],
  startsAt: '2026-08-22T00:00:00.000Z',
  endsAt: '2026-08-23T00:00:00.000Z',
  action: { label: '자세히 보기', href: '/map?view=cards' },
  dismissible: true,
  revision: 2,
};

const searchItems = [
  {
    id: 'case-local-1',
    kind: 'case',
    title: '김○○ · 17세',
    summary: '2026년 8월 서울 중구에서 실종 신고된 공식 사례입니다.',
    regionLabel: '서울 중구',
    statusLabel: '수색 중',
    sourceLabel: '공식 실종 신고',
    publishedAt: '2026-08-21T08:00:00.000Z',
    href: '/missing/case-local-1',
  },
  {
    id: 'report-local-1',
    kind: 'report',
    title: '검토 완료 시민 제보',
    summary: '서울 중구 인근에서 유사 인물을 보았다는 제보입니다.',
    regionLabel: '서울 중구',
    statusLabel: '검토 완료',
    sourceLabel: '운영팀 검토 제보',
    publishedAt: '2026-08-22T02:00:00.000Z',
    href: '/map?view=cards&reportId=report-local-1',
  },
  {
    id: 'news-local-1',
    kind: 'news',
    title: '실종 예방 안내',
    summary: '안전한 제보와 신고 방법을 안내합니다.',
    sourceLabel: '실종자알림 뉴스',
    publishedAt: '2026-08-20T03:00:00.000Z',
    href: '/news/news-local-1',
  },
];

const publicReports = [
  {
    id: 'report-local-1',
    kind: 'report',
    caseId: 'case-local-1',
    reportType: 'sighting',
    occurredAt: '2026-08-22T02:00:00.000Z',
    publicDescription: '파란색 상의를 입은 유사 인물을 보았다는 검토 완료 제보입니다.',
    publicLocationText: '서울 중구 인근',
    publicLocation: { lat: 37.5668, lng: 126.9787 },
    publicRadiusM: 500,
    publicStatus: 'approved',
    sourceLabel: '운영팀 검토 제보',
    href: '/map?view=cards&reportId=report-local-1',
  },
];

async function installApiMocks(page, flags = enabledFlags) {
  await page.route('**/api/config/ui*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, schemaVersion: 1, flags }),
  }));
  await page.route('**/api/v2/banners*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, banners: [publicBanner] }),
  }));
  const fulfillSearch = (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      provider: 'firestore-fallback',
      items: searchItems,
      total: searchItems.length,
      capped: false,
    }),
  });
  await page.route('**/api/search/query*', fulfillSearch);
  await page.route('**/api/search/suggestions*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, suggestions: [] }),
  }));
  await page.route('**/api/search*', fulfillSearch);
  await page.route('**/api/v2/explore/reports*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, items: publicReports }),
  }));
}

async function dismissLegacyOverlays(page) {
  const dismissPopup = page.getByRole('button', { name: '오늘 하루 보지 않기' });
  await dismissPopup.waitFor({ state: 'attached', timeout: 6000 }).catch(() => undefined);
  for (let index = 0; index < 6; index += 1) {
    if (await dismissPopup.count() === 0) break;
    await dismissPopup.click({ force: true });
    await page.waitForTimeout(200);
  }
  const deferInstall = page.getByRole('button', { name: '나중에' });
  await deferInstall.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
  if (await deferInstall.isVisible().catch(() => false)) await deferInstall.click();
}

test('feature-on mobile dashboard exposes emergency banner and safety navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiMocks(page);
  await page.goto('/');
  await expect(page.getByRole('alert', { name: '긴급 안전 알림' })).toContainText('긴급 실종 알림');
  await dismissLegacyOverlays(page);
  const mobileNavigation = page.getByRole('navigation', { name: '모바일 주요 메뉴' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('button', { name: '제보' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '모바일 빠른 메뉴' })).toHaveCount(0);
  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/feature-on-home-mobile.png'),
  });
});

test('feature-on home follows the first redesign search-to-action information flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installApiMocks(page);
  await page.goto('/');
  await dismissLegacyOverlays(page);

  const searchPanel = page.locator('#dashboard-search');
  await expect(searchPanel.getByRole('heading', { name: '실종자·지역·인상착의 통합 검색' })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '홈 섹션 바로가기' })).toHaveCount(0);

  const expectedSections = [
    ['dashboard-search', 'search'],
    ['dashboard-urgent', 'urgent-cases'],
    ['dashboard-explore', 'case-details'],
    ['dashboard-actions', 'quick-actions'],
    ['dashboard-public-reports', 'public-reports'],
    ['dashboard-own-reports', 'own-reports'],
    ['dashboard-region', 'region-summary'],
    ['dashboard-news', 'news'],
  ];
  for (const [id, moduleId] of expectedSections) {
    await expect(page.locator(`#${id}[data-dashboard-module="${moduleId}"]`)).toHaveCount(1);
  }
  const contentOrder = await page.locator('main [data-dashboard-module]').evaluateAll((elements) => elements.map((element) => element.id));
  expect(contentOrder).toEqual(expectedSections.map(([id]) => id));

  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/feature-on-home-desktop.png'),
  });
  await searchPanel.getByPlaceholder('이름·지역·인상착의를 입력하세요').fill('서울');
  await searchPanel.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=%EC%84%9C%EC%9A%B8$/);
});

test('feature-on unified search keeps source types visibly distinct', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installApiMocks(page);
  await page.goto('/search?q=서울&tab=all');
  await dismissLegacyOverlays(page);
  await expect(page.getByText('검색 결과 3건')).toBeVisible();
  await expect(page.getByText('공식 사건', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('승인 제보', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('공식·승인 공개정보만 표시')).toBeVisible();
  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/feature-on-search-desktop.png'),
  });
});

test('feature-on explorer renders reviewed reports in cards mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installApiMocks(page);
  await page.goto('/map?view=cards');
  await dismissLegacyOverlays(page);
  await expect(page.getByText('지도·목록 통합 탐색')).toBeVisible();
  await expect(page.getByRole('heading', { name: '승인 공개 제보 1건' })).toBeVisible();
  await expect(page.getByText('운영 검토 완료')).toBeVisible();
  await expect(page.getByText('서울 중구 인근').first()).toBeVisible();
  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/feature-on-explorer-desktop.png'),
  });
});

test('sidebar flattens public navigation and groups personal tools inside profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installApiMocks(page);
  await page.goto('/profile');
  await dismissLegacyOverlays(page);

  const globalSidebar = page.getByRole('complementary', { name: '사이드바' });
  await expect(globalSidebar.getByRole('button', { name: '현황', exact: true })).toBeVisible();
  await expect(globalSidebar.getByRole('button', { name: '내 프로필', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(globalSidebar.getByRole('button', { name: /내 제보/ })).toHaveCount(0);
  await expect(globalSidebar.getByRole('button', { name: /관심 알림/ })).toHaveCount(0);

  const profileMenu = page.getByRole('complementary', { name: '프로필 메뉴' });
  await expect(profileMenu.getByRole('button', { name: /내 정보/ })).toHaveAttribute('aria-current', 'page');
  await profileMenu.getByRole('button', { name: /내 제보/ }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(profileMenu.getByRole('button', { name: /내 제보/ })).toHaveAttribute('aria-current', 'page');
  await profileMenu.getByRole('button', { name: /관심 알림/ }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(profileMenu.getByRole('button', { name: /관심 알림/ })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/profile-hub-desktop.png'),
  });
});

test('feature-off search uses the documented safe fallback', async ({ page }) => {
  await installApiMocks(page, Object.fromEntries(Object.keys(enabledFlags).map((name) => [name, false])));
  await page.goto('/search?q=서울');
  await dismissLegacyOverlays(page);
  await expect(page.getByRole('heading', { name: '통합 검색을 준비하고 있습니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '지도에서 찾기' })).toBeVisible();
});

test('privacy policy is public and linked from the portal shell', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/privacy');
  await dismissLegacyOverlays(page);
  await expect(page.getByRole('heading', { name: '개인정보 처리방침', exact: true }).last()).toBeVisible();
  await expect(page.getByText('회원가입 없이 언제든지 확인할 수 있으며')).toBeVisible();
  await expect(page.getByText(/Firebase Authentication은 미국에서 처리/)).toBeVisible();
  await expect(page.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy');
  await page.screenshot({
    path: path.resolve('artifacts/reporting-refactor/browser/privacy-policy-desktop.png'),
    fullPage: true,
  });
});

test('search remains operable with keyboard, reduced motion, and narrow layout', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 640, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installApiMocks(page);
  await page.goto('/search');
  await dismissLegacyOverlays(page);
  const query = page.getByPlaceholder('이름·지역·인상착의 검색');
  await query.focus();
  await expect(query).toBeFocused();
  await query.fill('서울');
  await query.press('Enter');
  await expect(page.getByText('검색 결과 3건')).toBeVisible();
  await page.keyboard.press('Tab');
  const activeElementTag = await page.evaluate(() => document.activeElement?.tagName);
  expect(['A', 'BUTTON', 'INPUT']).toContain(activeElementTag);
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
