import { useCallback, useState } from 'react';
import type { PublicSearchState, PublicSearchTab } from '../../types/search';

const SEARCH_TABS = new Set<PublicSearchTab>(['all', 'cases', 'reports', 'news']);
const SENSITIVE_QUERY = /(?:\b\d{2,3}-?\d{3,4}-?\d{4}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{6}-?[1-4]\d{6}\b)/;

const readSearchState = (): PublicSearchState => {
  if (typeof window === 'undefined') return { q: '', tab: 'all', region: '' };
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') as PublicSearchTab | null;
  const transientQuery = typeof window.history.state?.transientSearchQuery === 'string' ? window.history.state.transientSearchQuery : '';
  return {
    q: (params.get('q') || transientQuery).slice(0, 80),
    tab: tab && SEARCH_TABS.has(tab) ? tab : 'all',
    region: (params.get('region') || '').slice(0, 40),
  };
};

export const useSearchState = () => {
  const [state, setState] = useState<PublicSearchState>(readSearchState);

  const commit = useCallback((next: PublicSearchState) => {
    const normalized = { ...next, q: next.q.trim().slice(0, 80), region: next.region.trim().slice(0, 40) };
    const params = new URLSearchParams();
    if (normalized.q && !SENSITIVE_QUERY.test(normalized.q)) params.set('q', normalized.q);
    if (normalized.tab !== 'all') params.set('tab', normalized.tab);
    if (normalized.region) params.set('region', normalized.region);
    const query = params.toString();
    window.history.pushState(SENSITIVE_QUERY.test(normalized.q) ? { transientSearchQuery: normalized.q } : {}, document.title, query ? `/search?${query}` : '/search');
    setState(normalized);
  }, []);

  return { state, commit };
};
