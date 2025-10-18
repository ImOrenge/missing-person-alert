export interface RegionDailyEntry {
  date: string;
  totalCases: number;
  activeCases: number;
}

export interface RegionStatSummary {
  regionId: string;
  regionName: string;
  code: string;
  totalCases: number;
  activeCases: number;
  latestCaseDate: string | null;
  daily: RegionDailyEntry[];
  subRegions: RegionSubStatSummary[];
}

export interface RegionSubStatSummary {
  subRegionId: string;
  parentRegionId: string;
  name: string;
  totalCases: number;
  activeCases: number;
  latestCaseDate: string | null;
  daily: RegionDailyEntry[];
}

export interface RegionStatsDocument {
  updatedAt?: number;
  generatedAt?: number;
  totals: {
    regions: number;
    totalCases: number;
    activeCases: number;
  };
  historyDays: number;
  regions: Record<string, RegionStatSummary>;
}

export interface RegionMetadataEntry {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  center: {
    lat: number;
    lng: number;
  };
}

export interface RegionMetadataDocument {
  lastUpdatedAt?: number;
  regions: RegionMetadataEntry[];
}
