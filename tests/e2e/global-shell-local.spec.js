const { test, expect } = require('@playwright/test');

const flags = {
  emergency_banner_v2_enabled: false,
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
  dashboard_personalization_enabled: false,
  admin_banner_v2_enabled: false,
};

const publicReports = [
  {
    id: 'public-report-1', kind: 'report', caseId: 'case-1', reportType: 'sighting',
    occurredAt: '2026-08-24T01:00:00.000Z', publicDescription: '파란색 외투를 입은 유사 인물을 버스 정류장 인근에서 보았습니다.',
    publicLocationText: '서울특별시 중구', publicLocation: { lat: 37.56, lng: 126.98 }, publicRadiusM: 500,
    publicStatus: 'approved', sourceLabel: '사용자 제보 · 운영 검토 완료', href: '/missing/case-1#public-report-public-report-1',
  },
  {
    id: 'public-report-2', kind: 'report', caseId: '', reportType: 'new_case_lead',
    occurredAt: '2026-08-23T02:00:00.000Z', publicDescription: '관계기관에서 이동 방향을 확인한 공개 제보입니다.',
    publicLocationText: '부산광역시 해운대구', publicLocation: { lat: 35.16, lng: 129.16 }, publicRadiusM: 1000,
    publicStatus: 'confirmed', sourceLabel: '사용자 제보 · 관계기관 확인', href: '/map?publicReportId=public-report-2',
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config/ui', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, schemaVersion: 1, flags }) }));
  await page.route('**/api/v2/explore/reports**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, items: publicReports, total: publicReports.length, capped: false }) }));
});

test('desktop global header and public reports page render without a sidebar', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/reports/public');
  await expect(page.getByRole('heading', { name: '검토된 사용자 제보', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('button', { name: '사용자 제보' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('파란색 외투를 입은 유사 인물')).toBeVisible();
  await expect(page.locator('[aria-label="사이드바"]')).toHaveCount(0);
  await expect(page.locator('#webpack-dev-server-client-overlay')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/global-shell/public-reports-desktop.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('mobile header exposes the complete menu and keeps the bottom navigation', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reports/public');
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('navigation', { name: '모바일 전체 메뉴' }).getByRole('button', { name: '사용자 제보' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: '모바일 주요 메뉴' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/global-shell/public-reports-mobile.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('home and profile reuse one global header and profile uses horizontal tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.c-app-header')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '실종자·지역·인상착의 통합 검색', level: 1 })).toBeVisible();
  await page.screenshot({ path: 'artifacts/global-shell/home-desktop.png', fullPage: true });

  await page.goto('/profile');
  await expect(page.locator('.c-app-header')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: '프로필 메뉴' })).toBeVisible();
  await expect(page.locator('.f-profile-hub__sidebar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /내 정보/ })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: 'artifacts/global-shell/profile-tabs-desktop.png', fullPage: true });
});

test('feature-off legacy map keeps the global header and moves controls into a map toolbar', async ({ page }) => {
  await page.unroute('**/api/config/ui');
  await page.route('**/api/config/ui', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, schemaVersion: 1, flags: { ...flags, unified_explorer_enabled: false } }) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/map');
  await expect(page.locator('.c-app-header')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '목록 닫기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '필터', exact: true }).first()).toBeVisible();
  await expect(page.locator('header.bg-gradient-to-r')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/global-shell/legacy-map-toolbar-desktop.png', fullPage: true });
});
