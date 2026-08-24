import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCaseNewsSearch, fetchNewsList } from '../services/newsService';
import type { CaseNewsContext, CaseNewsSearchCriteria, NaverNewsItem, NewsSearchMode } from '../types/news';

interface UseNewsFeedOptions {
  limit: number;
  from?: string;
  to?: string;
  caseId?: string;
  enabled?: boolean;
}

interface NewsFeedState {
  items: NaverNewsItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  sourceLabel: string;
  mode: NewsSearchMode;
  query: string;
  queries: string[];
  searchCriteria: CaseNewsSearchCriteria | null;
  caseContext: CaseNewsContext | null;
}

const INITIAL_STATE: NewsFeedState = {
  items: [],
  loading: false,
  loadingMore: false,
  error: null,
  nextCursor: null,
  sourceLabel: 'NAVER 검색 결과',
  mode: 'HISTORY_CACHE',
  query: '실종',
  queries: [],
  searchCriteria: null,
  caseContext: null,
};

const mergeUniqueNewsItems = (current: NaverNewsItem[], incoming: NaverNewsItem[]): NaverNewsItem[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return Array.from(byId.values());
};

export function useNewsFeed({ limit, from, to, caseId, enabled = true }: UseNewsFeedOptions) {
  const [state, setState] = useState<NewsFeedState>(INITIAL_STATE);
  const requestVersionRef = useRef(0);

  const load = useCallback(async (append: boolean, cursor?: string) => {
    const requestVersion = ++requestVersionRef.current;
    setState((previous) => ({
      ...previous,
      loading: !append,
      loadingMore: append,
      error: null,
      ...(append ? {} : {
        items: [],
        nextCursor: null,
        mode: caseId ? 'CASE_CONTEXT_SEARCH' : 'HISTORY_CACHE',
        query: caseId ? '' : INITIAL_STATE.query,
        queries: [],
        searchCriteria: null,
        caseContext: null,
      }),
    }));

    try {
      const response = caseId
        ? await fetchCaseNewsSearch({ caseId, limit, cursor })
        : await fetchNewsList({ limit, cursor, from, to });
      if (requestVersion !== requestVersionRef.current) return;
      setState((previous) => ({
        items: append ? mergeUniqueNewsItems(previous.items, response.items) : response.items,
        loading: false,
        loadingMore: false,
        error: null,
        nextCursor: response.nextCursor,
        sourceLabel: response.sourceLabel || INITIAL_STATE.sourceLabel,
        mode: response.mode || 'HISTORY_CACHE',
        query: response.query || INITIAL_STATE.query,
        queries: response.queries || [],
        searchCriteria: response.searchCriteria || null,
        caseContext: response.caseContext || null,
      }));
    } catch (error: any) {
      if (requestVersion !== requestVersionRef.current) return;
      setState((previous) => ({
        ...previous,
        loading: false,
        loadingMore: false,
        error: typeof error?.response?.data?.error === 'string'
          ? error.response.data.error
          : '뉴스 목록을 불러오지 못했습니다.',
      }));
    }
  }, [caseId, from, limit, to]);

  const reload = useCallback(() => load(false), [load]);
  const loadMore = useCallback(() => {
    if (!state.nextCursor || state.loading || state.loadingMore) return;
    void load(true, state.nextCursor);
  }, [load, state.loading, state.loadingMore, state.nextCursor]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [enabled, reload]);

  return { ...state, reload, loadMore };
}
