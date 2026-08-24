export type PublicSearchKind = 'case' | 'report' | 'news';
export type PublicSearchTab = 'all' | 'cases' | 'reports' | 'news';

export interface PublicSearchItem {
  id: string;
  kind: PublicSearchKind;
  title: string;
  summary: string;
  regionLabel?: string;
  thumbnailUrl?: string;
  statusLabel?: string;
  sourceLabel: string;
  publishedAt?: string;
  href: string;
}

export interface PublicSearchResponse {
  success: true;
  provider: 'firestore-fallback' | 'algolia';
  items: PublicSearchItem[];
  total: number;
  capped: boolean;
  requestId?: string;
  tab?: PublicSearchTab;
  page?: { nextCursor?: string; hasMore: boolean; limit: number };
  counts?: { cases: number; reports: number; news: number };
  processingMs?: number;
  freshness?: { indexedAt: string };
}

export interface PublicSearchState {
  q: string;
  tab: PublicSearchTab;
  region: string;
}
