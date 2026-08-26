export type StatisticsCategoryKey = 'children' | 'disabled' | 'dementia' | 'adult';
export type StatisticsMetric = 'received' | 'unresolved';

export interface PoliceStatisticsYear {
  year: number;
  categories: Record<StatisticsCategoryKey, {received: number; released: number; unresolved: number}>;
  totals: {received: number; released: number; unresolved: number; vulnerableReceived: number};
  derived: {
    daysInYear: number;
    dailyAverageReceived: number;
    dailyAverageVulnerableReceived: number;
    yearOverYearPercent: Record<string, number | null>;
  };
  source: {
    sourceId: string;
    datasetTitle: string;
    datasetCutoff: string | null;
    sourceHash: string;
    encoding: string;
    officialPageUrl?: string | null;
  };
  published: boolean;
  schemaVersion: 1;
}
