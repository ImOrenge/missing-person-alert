import { useCallback, useState } from 'react';

export type ExploreViewMode = 'split' | 'map' | 'list' | 'cards';

const VIEW_MODES = new Set<ExploreViewMode>(['split', 'map', 'list', 'cards']);

const getDefaultView = (): ExploreViewMode => {
  if (typeof window === 'undefined') return 'split';
  return window.matchMedia('(min-width: 768px)').matches ? 'split' : 'list';
};

const readView = (): ExploreViewMode => {
  if (typeof window === 'undefined') return 'split';
  const candidate = new URLSearchParams(window.location.search).get('view') as ExploreViewMode | null;
  return candidate && VIEW_MODES.has(candidate) ? candidate : getDefaultView();
};

export const useExploreState = () => {
  const [view, setViewState] = useState<ExploreViewMode>(readView);

  const setView = useCallback((nextView: ExploreViewMode) => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', nextView);
    window.history.pushState({}, document.title, `/map?${params.toString()}`);
    setViewState(nextView);
  }, []);

  return { view, setView };
};
