import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRegionMetadata, getRegionStats, type RegionStatsData } from '../services/regionStatsService';
import type { RegionMetadataDocument, RegionStatSummary } from '../types/regionStats';

export type RegionStatsRange = 'day' | 'week' | 'month' | 'all';

export interface AggregatedRegionStats extends RegionStatSummary {
  totalInRange: number;
  activeInRange: number;
}

export interface UseRegionStatsState {
  loading: boolean;
  error: string | null;
  stats: RegionStatsData | null;
  metadata: RegionMetadataDocument | null;
  regions: AggregatedRegionStats[];
  totals: {
    totalCases: number;
    activeCases: number;
  };
  refreshedAt?: number;
  lastFetchedAt?: number;
  refresh: (force?: boolean) => Promise<void>;
}

const RANGE_IN_DAYS: Record<Exclude<RegionStatsRange, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30
};

const parseDateKey = (value: string): Date | null => {
  if (!value) return null;
  const iso = `${value}T00:00:00Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isDateWithinRange = (dateKey: string, range: RegionStatsRange): boolean => {
  if (range === 'all') {
    return true;
  }

  const target = parseDateKey(dateKey);
  if (!target) {
    return false;
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (RANGE_IN_DAYS[range] - 1));

  return target >= start;
};

const aggregateRegions = (stats: RegionStatsData | null, range: RegionStatsRange): AggregatedRegionStats[] => {
  if (!stats) {
    return [];
  }

  return stats.regions.map((region) => {
    if (range === 'all') {
      return {
        ...region,
        totalInRange: region.totalCases,
        activeInRange: region.activeCases
      };
    }

    const filtered = region.daily.filter((entry) => isDateWithinRange(entry.date, range));
    const totalInRange = filtered.reduce((sum, entry) => sum + entry.totalCases, 0);
    const activeInRange = filtered.reduce((sum, entry) => sum + entry.activeCases, 0);

    return {
      ...region,
      totalInRange,
      activeInRange
    };
  }).sort((a, b) => {
    if (b.totalInRange !== a.totalInRange) {
      return b.totalInRange - a.totalInRange;
    }
    return a.regionName.localeCompare(b.regionName);
  });
};

export const useRegionStatsData = (isOpen: boolean, range: RegionStatsRange): UseRegionStatsState => {
  const [stats, setStats] = useState<RegionStatsData | null>(null);
  const [metadata, setMetadata] = useState<RegionMetadataDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | undefined>(undefined);

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);
      const [statsData, metadataData] = await Promise.all([
        getRegionStats({ force }),
        getRegionMetadata({ force })
      ]);
      setStats(statsData);
      setMetadata(metadataData);
      setLastFetchedAt(Date.now());
    } catch (err: any) {
      console.error('지역 통계 조회 실패', err);
      setError(err?.message ?? '통계 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !stats && !loading) {
      load(false);
    }
  }, [isOpen, stats, load, loading]);

  const regions = useMemo(() => aggregateRegions(stats, range), [stats, range]);
  const totals = useMemo(() => {
    if (range === 'all') {
      return {
        totalCases: stats?.totals.totalCases ?? 0,
        activeCases: stats?.totals.activeCases ?? 0
      };
    }

    return regions.reduce(
      (acc, region) => {
        acc.totalCases += region.totalInRange;
        acc.activeCases += region.activeInRange;
        return acc;
      },
      { totalCases: 0, activeCases: 0 }
    );
  }, [regions, stats, range]);

  const refreshedAt = stats?.updatedAt ?? stats?.generatedAt;

  return {
    loading,
    error,
    stats,
    metadata,
    regions,
    totals,
    refreshedAt,
    lastFetchedAt,
    refresh: load
  };
};
