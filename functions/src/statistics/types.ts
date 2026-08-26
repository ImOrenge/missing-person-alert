export type StatisticsCategoryKey = "children" | "disabled" | "dementia" | "adult";

export interface StatisticsCategoryCounts {
  received: number;
  released: number;
  unresolved: number;
}

export interface PoliceStatisticsYear {
  year: number;
  categories: Record<StatisticsCategoryKey, StatisticsCategoryCounts>;
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
    storagePath?: string;
    encoding: string;
    officialPageUrl?: string | null;
  };
  schemaVersion: 1;
  published: boolean;
}

export interface StatisticsIngestResult {
  runId: string;
  sourceHash: string;
  status: "success" | "unchanged" | "dry_run";
  years: number[];
  created: number;
  updated: number;
  unchanged: number;
  warnings: string[];
  storagePath?: string;
}
