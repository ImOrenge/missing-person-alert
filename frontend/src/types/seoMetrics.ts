export type SeoSourceName = 'google' | 'naver' | 'bing' | 'daum' | 'direct' | 'other';
export type SeoPageGroupName = 'home' | 'nationwide' | 'region' | 'type' | 'recent' | 'statistics' | 'guide' | 'detail' | 'other';

export interface SeoMetricDay {
  date: string;
  detailViews: number;
  mapClicks: number;
  reportStarts: number;
  shares: number;
  calls112: number;
  calls182: number;
  returnVisits: number;
  searchEntries: number;
  detailStarts: number;
  sourceEntries: Record<SeoSourceName, number>;
  pageGroupEntries: Record<SeoPageGroupName, number>;
}

export interface SeoMetricsSummary {
  rangeDays: number;
  startDate: string;
  endDate: string;
  totals: Omit<SeoMetricDay, 'date'>;
  rates: {
    mapViewRate: number;
    shareRate: number;
    reportStartRate: number;
    callRate: number;
    searchToDetailRate: number;
    returnVisitRate: number;
    homeSearchShare: number;
    expansionSearchShare: number;
  };
  daily: SeoMetricDay[];
}

export interface SeoMetricsResponse {
  success: true;
  summary: SeoMetricsSummary;
  sourceBuckets: SeoSourceName[];
  pageGroupBuckets: SeoPageGroupName[];
  generatedAt: string;
  measurementNote: string;
}
