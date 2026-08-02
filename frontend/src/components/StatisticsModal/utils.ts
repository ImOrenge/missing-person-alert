import { useEffect, useState } from 'react';
import type { AggregatedRegionStats, RegionStatsRange } from '../../hooks/useRegionStatsData';
import type { RegionSubStatSummary } from '../../types/regionStats';

export interface AggregatedSubRegionStats extends RegionSubStatSummary {
  totalInRange: number;
  activeInRange: number;
}

export const formatKoreanDateTime = (timestamp?: number): string | null => {
  if (!timestamp) return null;
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false
    }).format(new Date(timestamp));
  } catch (error) {
    console.warn('날짜 포맷팅 실패', error);
    return null;
  }
};

export const formatRelativeTime = (timestamp?: number): string | null => {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
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
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return target >= start;
};

export const aggregateSubRegionsForRange = (
  subRegions: RegionSubStatSummary[],
  range: RegionStatsRange
): AggregatedSubRegionStats[] => {
  return subRegions
    .map((subRegion) => {
      if (range === 'all') {
        return {
          ...subRegion,
          totalInRange: subRegion.totalCases,
          activeInRange: subRegion.activeCases
        };
      }

      const totals = subRegion.daily.reduce(
        (acc, entry) => {
          if (isDateWithinRange(entry.date, range)) {
            acc.total += entry.totalCases;
            acc.active += entry.activeCases;
          }
          return acc;
        },
        { total: 0, active: 0 }
      );

      return {
        ...subRegion,
        totalInRange: totals.total,
        activeInRange: totals.active
      };
    })
    .sort((a, b) => b.totalInRange - a.totalInRange || a.name.localeCompare(b.name));
};

export const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
};

export const useModalBodyScroll = (isOpen: boolean) => {
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    return () => undefined;
  }, [isOpen]);
};

export const computeHasFreshData = (updatedAt?: number) => {
  if (!updatedAt) return false;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt < ONE_DAY_MS;
};

export const computeTopRegions = (regions: AggregatedRegionStats[]) => regions.slice(0, 3);
