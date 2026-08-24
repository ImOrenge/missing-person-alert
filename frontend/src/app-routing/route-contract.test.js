import { getPathForView, getViewFromAppLocation } from './route-contract';

describe('app route contract', () => {
  test.each([
    ['/', '', 'dashboard'],
    ['/search', '', 'search'],
    ['/alerts', '', 'alerts'],
    ['/map/', '', 'map'],
    ['/community', '', 'community'],
    ['/news', '', 'news'],
    ['/statistics', '', 'statistics'],
    ['/reports/public', '', 'public-reports'],
    ['/profile', '', 'profile'],
    ['/reports', '', 'reports'],
    ['/reports/new', '', 'report'],
    ['/privacy', '', 'privacy'],
    ['/admin/reports', '', 'admin'],
    ['/', '?view=map', 'map'],
  ])('maps %s%s to %s', (pathname, search, expectedView) => {
    expect(getViewFromAppLocation({ pathname, search })).toBe(expectedView);
  });

  it('preserves the current deep-link query contract', () => {
    expect(getPathForView('map', 'case/1')).toBe('/map?personId=case%2F1');
    expect(getPathForView('community', 'case 1')).toBe('/community?personId=case%201');
    expect(getPathForView('report', 'case-1')).toBe('/reports/new?personId=case-1');
    expect(getPathForView('news', 'article-1')).toBe('/news?articleId=article-1');
  });

  it('keeps the dashboard and report paths stable', () => {
    expect(getPathForView('dashboard')).toBe('/');
    expect(getPathForView('report')).toBe('/reports/new');
    expect(getPathForView('public-reports')).toBe('/reports/public');
    expect(getPathForView('privacy')).toBe('/privacy');
  });
});
