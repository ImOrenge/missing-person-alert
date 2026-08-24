export interface NaverNewsItem {
  id: string;
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

export type NewsSearchMode = 'HISTORY_CACHE' | 'CASE_CONTEXT_SEARCH';

export interface CaseNewsContext {
  id: string;
  name: string;
  verification: 'UNVERIFIED_SEARCH_RESULTS';
}

export interface CaseNewsSearchCriteria {
  name: string;
  region: string | null;
  appearance: string | null;
}

export interface NewsListResponse {
  success: true;
  source: 'NAVER_API_HUB';
  sourceLabel: string;
  mode: NewsSearchMode;
  query: string;
  queries?: string[];
  searchCriteria?: CaseNewsSearchCriteria;
  retentionDays: number;
  associationStored?: boolean;
  caseContext?: CaseNewsContext;
  total?: number;
  items: NaverNewsItem[];
  nextCursor: string | null;
}

export interface NewsListRequest {
  limit?: number;
  cursor?: string;
  from?: string;
  to?: string;
}

export interface CaseNewsSearchRequest {
  caseId: string;
  limit?: number;
  cursor?: string;
}
