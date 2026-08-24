export type AppView =
  | 'dashboard'
  | 'search'
  | 'alerts'
  | 'map'
  | 'community'
  | 'news'
  | 'statistics'
  | 'public-reports'
  | 'profile'
  | 'reports'
  | 'admin'
  | 'report'
  | 'privacy';

export interface AppLocation {
  pathname: string;
  search: string;
}

const normalizePathname = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

export const getViewFromAppLocation = ({ pathname, search }: AppLocation): AppView => {
  const normalizedPathname = normalizePathname(pathname);
  const legacyView = new URLSearchParams(search).get('view');

  if (normalizedPathname === '/search' || legacyView === 'search') return 'search';
  if (normalizedPathname === '/alerts' || legacyView === 'alerts') return 'alerts';
  if (normalizedPathname === '/statistics' || legacyView === 'statistics') return 'statistics';
  if (normalizedPathname === '/reports/public' || legacyView === 'public-reports') return 'public-reports';
  if (normalizedPathname === '/profile' || legacyView === 'profile') return 'profile';
  if (normalizedPathname === '/reports' || legacyView === 'reports') return 'reports';
  if (normalizedPathname === '/reports/new' || legacyView === 'report') return 'report';
  if (normalizedPathname === '/privacy') return 'privacy';
  if (normalizedPathname === '/admin' || normalizedPathname.startsWith('/admin/')) return 'admin';
  if (normalizedPathname === '/community' || legacyView === 'community') return 'community';
  if (normalizedPathname === '/news' || legacyView === 'news') return 'news';
  if (normalizedPathname === '/map' || legacyView === 'map') return 'map';
  return 'dashboard';
};

export const getViewFromLocation = (): AppView => {
  if (typeof window === 'undefined') return 'dashboard';
  return getViewFromAppLocation(window.location);
};

export const getPathForView = (view: AppView, personId?: string) => {
  const path = view === 'dashboard' ? '/' : view === 'report' ? '/reports/new' : view === 'public-reports' ? '/reports/public' : `/${view}`;

  if (personId && (view === 'map' || view === 'community' || view === 'report')) {
    return `${path}?personId=${encodeURIComponent(personId)}`;
  }
  if (personId && view === 'news') {
    return `${path}?articleId=${encodeURIComponent(personId)}`;
  }
  return path;
};
