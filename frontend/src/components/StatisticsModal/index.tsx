import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BarChart3, Calendar, ChevronLeft, ChevronRight, Info, RefreshCw, X } from 'lucide-react';
import { useRegionStatsData, type RegionStatsRange } from '../../hooks/useRegionStatsData';
import type { AggregatedRegionStats } from '../../hooks/useRegionStatsData';
import type { RegionSubStatSummary } from '../../types/regionStats';
import { MinimapHeatmap } from './MinimapHeatmap';

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AggregatedSubRegionStats extends RegionSubStatSummary {
  totalInRange: number;
  activeInRange: number;
}

const RANGE_OPTIONS: { id: RegionStatsRange; label: string }[] = [
  { id: 'day', label: '일간' },
  { id: 'week', label: '주간' },
  { id: 'month', label: '월간' },
  { id: 'all', label: '전체' }
];

const formatKoreanDateTime = (timestamp?: number): string | null => {
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

const formatRelativeTime = (timestamp?: number): string | null => {
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

const aggregateSubRegionsForRange = (subRegions: RegionSubStatSummary[], range: RegionStatsRange): AggregatedSubRegionStats[] => {
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

const usePrefersReducedMotion = (): boolean => {
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

const useModalBodyScroll = (isOpen: boolean) => {
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

const computeHasFreshData = (updatedAt?: number) => {
  if (!updatedAt) return false;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt < ONE_DAY_MS;
};

const computeTopRegions = (regions: AggregatedRegionStats[]) => regions.slice(0, 3);

interface RegionBarChartProps {
  data: AggregatedRegionStats[];
  selectedId?: string | null;
  onSelect?: (regionId: string) => void;
  emptyMessage?: string;
  reduceMotion?: boolean;
}

const RegionBarChart: React.FC<RegionBarChartProps> = ({ data, selectedId, onSelect, emptyMessage, reduceMotion }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
        <BarChart3 className="mb-3 h-8 w-8 text-gray-300" />
        <p>{emptyMessage ?? '선택한 기간에 대한 데이터가 없습니다.'}</p>
      </div>
    );
  }

  const maxValue = data.reduce((max, region) => Math.max(max, region.totalInRange), 0) || 1;
  const clickable = typeof onSelect === 'function';

  return (
    <div className="space-y-3">
      {data.map((region) => {
        const ratio = Math.max((region.totalInRange / maxValue) * 100, 4);
        const isSelected = selectedId === region.regionId;

        return (
          <button
            key={region.regionId}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(region.regionId)}
            className={`group w-full rounded-xl border px-4 py-3 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
              isSelected ? 'border-red-200 bg-red-50/60' : 'border-gray-100 bg-white'
            } ${
              clickable
                ? reduceMotion
                  ? ''
                  : 'transition hover:translate-y-[-1px] hover:shadow-md disabled:hover:translate-y-0 disabled:hover:shadow-sm'
                : 'cursor-default'
            }`}
            aria-pressed={isSelected}
          >
            <div className="flex items-center justify-between text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isSelected ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'
                }`}>
                  {region.regionName.slice(0, 2)}
                </span>
                {region.regionName}
              </span>
              <span className="text-sm font-semibold text-slate-800" aria-label={`${region.regionName} 건수`}>
                {region.totalInRange.toLocaleString()}건
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100" role="presentation">
              <div
                className={`h-2 rounded-full transition-all ${isSelected ? 'bg-red-500' : 'bg-gradient-to-r from-red-500 to-red-600 group-disabled:bg-red-300'}`}
                style={{ width: `${ratio}%` }}
                title={`${region.regionName}: ${region.totalInRange.toLocaleString()}건`}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {region.activeInRange > 0 ? (
                <span>활성 사례 {region.activeInRange.toLocaleString()}건</span>
              ) : (
                <span>활성 사례 없음</span>
              )}
              {region.latestCaseDate && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden />
                  최근 신고 {region.latestCaseDate}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

interface SubRegionBarChartProps {
  data: AggregatedSubRegionStats[];
  selectedId?: string | null;
  onSelect?: (subRegionId: string) => void;
  reduceMotion?: boolean;
}

const SubRegionBarChart: React.FC<SubRegionBarChartProps> = ({ data, selectedId, onSelect, reduceMotion }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
        <BarChart3 className="mb-3 h-8 w-8 text-gray-300" />
        <p>선택한 지역에 대한 하위 데이터가 없습니다.</p>
      </div>
    );
  }

  const maxValue = data.reduce((max, region) => Math.max(max, region.totalInRange), 0) || 1;

  return (
    <div className="space-y-3">
      {data.map((subRegion) => {
        const ratio = Math.max((subRegion.totalInRange / maxValue) * 100, 4);
        const isSelected = selectedId === subRegion.subRegionId;

        return (
          <button
            key={subRegion.subRegionId}
            type="button"
            onClick={() => onSelect?.(subRegion.subRegionId)}
            className={`w-full rounded-xl border px-4 py-3 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
              isSelected ? 'border-blue-200 bg-blue-50/70' : 'border-gray-100 bg-white'
            } ${
              onSelect
                ? reduceMotion
                  ? ''
                  : 'transition hover:translate-y-[-1px] hover:shadow-md'
                : 'cursor-default'
            }`}
            aria-pressed={isSelected}
          >
            <div className="flex items-center justify-between text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isSelected ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
                }`}>
                  {subRegion.name.slice(0, 2)}
                </span>
                {subRegion.name}
              </span>
              <span className="text-sm font-semibold text-slate-800" aria-label={`${subRegion.name} 건수`}>
                {subRegion.totalInRange.toLocaleString()}건
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100" role="presentation">
              <div
                className={`h-2 rounded-full transition-all ${isSelected ? 'bg-blue-500' : 'bg-gradient-to-r from-blue-400 to-blue-600'}`}
                style={{ width: `${ratio}%` }}
                title={`${subRegion.name}: ${subRegion.totalInRange.toLocaleString()}건`}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {subRegion.activeInRange > 0 ? (
                <span>활성 사례 {subRegion.activeInRange.toLocaleString()}건</span>
              ) : (
                <span>활성 사례 없음</span>
              )}
              {subRegion.latestCaseDate && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden />
                  최근 신고 {subRegion.latestCaseDate}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

const SummaryMetric: React.FC<{ label: string; value: number; accent?: 'primary' | 'neutral' }> = ({ label, value, accent = 'neutral' }) => {
  const accentClasses =
    accent === 'primary'
      ? 'bg-red-50 text-red-600 ring-1 ring-red-100'
      : 'bg-slate-50 text-slate-600 ring-1 ring-slate-100';
  return (
    <div className={`flex flex-col gap-1 rounded-xl px-4 py-3 text-sm font-medium ${accentClasses}`}>
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-xl font-semibold">{value.toLocaleString()}건</span>
    </div>
  );
};

interface TrendWindowConfig {
  id: '7d' | '30d' | '90d' | 'all';
  label: string;
  days: number | null;
}

const COMPARISON_WINDOWS: TrendWindowConfig[] = [
  { id: '7d', label: '최근 7일', days: 7 },
  { id: '30d', label: '최근 30일', days: 30 },
  { id: '90d', label: '최근 90일', days: 90 },
  { id: 'all', label: '전체 기간', days: null }
];

const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (data.length === 0) {
    return null;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-hidden>
      <polyline points={points} fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
};

interface TrendComparisonPanelProps {
  sourceLabel: string;
  daily: { date: string; totalCases: number }[];
}

const TrendComparisonPanel: React.FC<TrendComparisonPanelProps> = ({ sourceLabel, daily }) => {
  if (!daily || daily.length === 0) {
    return null;
  }

  const windows = COMPARISON_WINDOWS.map((window) => {
    const slice = window.days ? daily.slice(-window.days) : daily;
    if (slice.length === 0) {
      return null;
    }

    const totals = slice.map((entry) => entry.totalCases);
    const first = totals[0] || 0;
    const last = totals[totals.length - 1] || 0;
    const change = first === 0 ? 0 : ((last - first) / first) * 100;
    const trendLabel = change === 0 ? '변화 없음' : change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;

    return {
      ...window,
      totals,
      change,
      trendLabel
    };
  }).filter((entry): entry is TrendWindowConfig & { totals: number[]; change: number; trendLabel: string } => Boolean(entry));

  if (windows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">기간별 신고 추이 비교</h4>
        <span className="text-xs text-slate-400">기준: {sourceLabel}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {windows.map((window) => (
          <div key={window.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{window.label}</span>
              <span
                className={`font-semibold ${
                  window.change === 0 ? 'text-slate-400' : window.change > 0 ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {window.trendLabel}
              </span>
            </div>
            <Sparkline data={window.totals} />
            <div className="mt-2 text-xs text-slate-500">
              최근 {window.totals[window.totals.length - 1].toLocaleString()}건
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const StatisticsModal: React.FC<StatisticsModalProps> = ({ isOpen, onClose }) => {
  const [range, setRange] = useState<RegionStatsRange>('week');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedSubRegionId, setSelectedSubRegionId] = useState<string | null>(null);
  const selectionInitializedRef = useRef(false);

  const { loading, error, stats, metadata, regions, totals, refreshedAt, lastFetchedAt, refresh } = useRegionStatsData(isOpen, range);
  const prefersReducedMotion = usePrefersReducedMotion();

  useModalBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedRegionId(null);
      setSelectedSubRegionId(null);
      selectionInitializedRef.current = false;
      return;
    }

    if (!stats || selectionInitializedRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const regionParam = params.get('statsRegion');
    const subRegionParam = params.get('statsSubRegion');

    if (regionParam && stats.regions.some((region) => region.regionId === regionParam)) {
      setSelectedRegionId(regionParam);
      const region = stats.regions.find((entry) => entry.regionId === regionParam);
      if (region && subRegionParam && region.subRegions.some((sub) => sub.subRegionId === subRegionParam)) {
        setSelectedSubRegionId(subRegionParam);
      }
    }

    selectionInitializedRef.current = true;
  }, [isOpen, stats]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (selectedRegionId) {
      params.set('statsRegion', selectedRegionId);
    } else {
      params.delete('statsRegion');
    }

    if (selectedRegionId && selectedSubRegionId) {
      params.set('statsSubRegion', selectedSubRegionId);
    } else {
      params.delete('statsSubRegion');
    }

    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, [isOpen, selectedRegionId, selectedSubRegionId]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete('statsRegion');
    params.delete('statsSubRegion');
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedRegionId && !regions.some((region) => region.regionId === selectedRegionId)) {
      setSelectedRegionId(null);
      setSelectedSubRegionId(null);
    }
  }, [isOpen, regions, selectedRegionId]);

  const selectedRegionFull = useMemo(() => stats?.regions.find((region) => region.regionId === selectedRegionId) ?? null, [stats, selectedRegionId]);
  const aggregatedSubRegions = useMemo(() => (selectedRegionFull ? aggregateSubRegionsForRange(selectedRegionFull.subRegions ?? [], range) : []), [selectedRegionFull, range]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedSubRegionId && !aggregatedSubRegions.some((sub) => sub.subRegionId === selectedSubRegionId)) {
      setSelectedSubRegionId(null);
    }
  }, [isOpen, aggregatedSubRegions, selectedSubRegionId]);

  const topRegions = useMemo(() => computeTopRegions(regions), [regions]);
  const updatedAtText = formatKoreanDateTime(refreshedAt);
  const hasFreshData = computeHasFreshData(refreshedAt);
  const lastFetchedText = formatRelativeTime(lastFetchedAt);
  const selectedRegionAggregated = useMemo(() => regions.find((region) => region.regionId === selectedRegionId) ?? null, [regions, selectedRegionId]);
  const selectedSubRegionAggregated = useMemo(() => aggregatedSubRegions.find((sub) => sub.subRegionId === selectedSubRegionId) ?? null, [aggregatedSubRegions, selectedSubRegionId]);

  const regionOptions = useMemo(() => stats?.regions.slice().sort((a, b) => a.regionName.localeCompare(b.regionName)) ?? [], [stats]);

  const overallDaily = useMemo(() => {
    if (!stats) {
      return [] as { date: string; totalCases: number; activeCases: number }[];
    }

    const map = new Map<string, { totalCases: number; activeCases: number }>();
    for (const region of stats.regions) {
      for (const entry of region.daily) {
        const current = map.get(entry.date) ?? { totalCases: 0, activeCases: 0 };
        current.totalCases += entry.totalCases;
        current.activeCases += entry.activeCases;
        map.set(entry.date, current);
      }
    }

    return Array.from(map.entries())
      .map(([date, totals]) => ({ date, totalCases: totals.totalCases, activeCases: totals.activeCases }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [stats]);

  const trendDaily = useMemo(() => {
    if (selectedRegionFull) {
      return selectedRegionFull.daily;
    }
    return overallDaily;
  }, [selectedRegionFull, overallDaily]);

  const handleRegionSelect = (regionId: string) => {
    setSelectedRegionId((current) => (current === regionId ? null : regionId));
    setSelectedSubRegionId(null);
  };

  const handleSubRegionSelect = (subRegionId: string) => {
    setSelectedSubRegionId((current) => (current === subRegionId ? null : subRegionId));
  };

  const handleDownloadCsv = useCallback(() => {
    const targetName = selectedRegionAggregated ? selectedRegionAggregated.regionName : '전국';
    const targetId = selectedRegionAggregated ? selectedRegionAggregated.regionId : 'national';
    const dataSource = selectedRegionFull ? selectedRegionFull.daily : overallDaily;

    if (!dataSource || dataSource.length === 0 || typeof window === 'undefined') {
      return;
    }

    const header = 'date,totalCases,activeCases\n';
    const rows = dataSource
      .map((entry) => `${entry.date},${entry.totalCases},${entry.activeCases ?? 0}`)
      .join('\n');
    const csvContent = `${header}${rows}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `region-stats-${targetId}.csv`;
    link.setAttribute('aria-label', `${targetName} 통계 CSV 다운로드`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [overallDaily, selectedRegionAggregated, selectedRegionFull]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 px-4 py-10 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-stats-modal-title"
        className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 id="region-stats-modal-title" className="text-xl font-bold text-slate-900">
                최근 실종 신고 현황
              </h2>
              {hasFreshData && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                  New
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              Firestore 기반 집계 데이터를 기준으로 지역별 실종 신고 건수를 제공합니다. 통계는 1시간마다 자동 갱신됩니다.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              {updatedAtText ? <span>최신 업데이트: {updatedAtText}</span> : <span>업데이트 시각을 불러오는 중...</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-slate-100 p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRange(option.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    range === option.id ? 'bg-white text-red-600 shadow-sm ring-1 ring-red-100' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-600"
              aria-label="모달 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[2fr,3fr]">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <SummaryMetric label="총 신고 건수" value={totals.totalCases} accent="primary" />
                <SummaryMetric label="활성 사례" value={totals.activeCases} />
              </div>

              <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">상위 영향 지역</h3>
                  <span className="text-xs text-slate-400">선택한 기간 기준 Top 3</span>
                </div>
                <div className="flex flex-col gap-2">
                  {topRegions.length > 0 ? (
                    topRegions.map((region, index) => (
                      <div
                        key={region.regionId}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600"
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
                            {index + 1}
                          </span>
                          {region.regionName}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{region.totalInRange.toLocaleString()}건</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                      상위 지역 데이터를 계산할 수 없습니다.
                    </div>
                  )}
                </div>
              </div>

              <MinimapHeatmap
                metadata={metadata}
                regions={regions}
                selectedRegionId={selectedRegionId}
                onSelect={handleRegionSelect}
                reduceMotion={prefersReducedMotion}
              />

              <details className="rounded-2xl bg-white p-4 text-xs text-slate-500 shadow-sm ring-1 ring-slate-100" open>
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
                  <Info className="h-4 w-4" />
                  데이터 안내
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Firestore `stats/regionDaily` 문서를 기반으로 한 집계 데이터입니다.</li>
                  <li>Cloud Functions 스케줄러가 1시간마다 데이터를 업데이트합니다.</li>
                  <li>`신고 건수` 기준이며, 접속/조회 통계와는 무관합니다.</li>
                </ul>
              </details>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-100">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-1">
                    <nav className="flex items-center gap-1 text-xs text-slate-400" aria-label="지역 탐색">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRegionId(null);
                          setSelectedSubRegionId(null);
                        }}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <ChevronLeft className="h-3 w-3" /> 전체
                      </button>
                      {selectedRegionAggregated && (
                        <>
                          <ChevronRight className="h-3 w-3" aria-hidden />
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{selectedRegionAggregated.regionName}</span>
                        </>
                      )}
                      {selectedSubRegionAggregated && (
                        <>
                          <ChevronRight className="h-3 w-3" aria-hidden />
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-600">{selectedSubRegionAggregated.name}</span>
                        </>
                      )}
                    </nav>
                    <h3 className="text-lg font-semibold text-slate-800">
                      {selectedRegionAggregated ? `${selectedRegionAggregated.regionName} 상세 추이` : '지역별 신고 추이'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedRegionId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) {
                          setSelectedRegionId(null);
                          setSelectedSubRegionId(null);
                        } else {
                          handleRegionSelect(value);
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                    >
                      <option value="">전체 지역 보기</option>
                      {regionOptions.map((region) => (
                        <option key={region.regionId} value={region.regionId}>
                          {region.regionName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedRegionAggregated && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <SummaryMetric label="선택 지역 신고" value={selectedRegionAggregated.totalInRange} accent="primary" />
                    <SummaryMetric label="선택 지역 활성" value={selectedRegionAggregated.activeInRange} />
                  </div>
                )}

                <div className="mt-4">
                  {loading && (
                    <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      통계 데이터를 불러오는 중입니다...
                    </div>
                  )}
                  {selectedRegionAggregated ? (
                    <SubRegionBarChart
                      data={aggregatedSubRegions}
                      selectedId={selectedSubRegionId}
                      onSelect={handleSubRegionSelect}
                      reduceMotion={prefersReducedMotion}
                    />
                  ) : (
                    <RegionBarChart
                      data={regions}
                      selectedId={selectedRegionId}
                      onSelect={handleRegionSelect}
                      emptyMessage="지역 데이터를 불러올 수 없습니다."
                      reduceMotion={prefersReducedMotion}
                    />
                  )}
                </div>

                <TrendComparisonPanel
                  sourceLabel={selectedRegionAggregated ? selectedRegionAggregated.regionName : '전국'}
                  daily={trendDaily}
                />
              </div>

              {selectedSubRegionAggregated && (
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">{selectedSubRegionAggregated.name} 최근 추이</h4>
                    {selectedSubRegionAggregated.latestCaseDate && (
                      <span className="text-xs text-slate-400">최근 신고 {selectedSubRegionAggregated.latestCaseDate}</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    {selectedSubRegionAggregated.daily.slice(-7).map((entry) => (
                      <div key={entry.date} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span>{entry.date}</span>
                        <span className="font-semibold text-slate-700">{entry.totalCases.toLocaleString()}건</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white/90 px-6 py-4 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-red-500' : 'text-slate-400'}`} aria-hidden />
            <span>
              마지막 새로고침 {lastFetchedText ?? '정보 없음'}
            </span>
            <span className="hidden md:inline">• 데이터는 1시간마다 자동 갱신됩니다</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
            >
              CSV 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                void refresh(true);
              }}
              disabled={loading}
              className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
            >
              {loading ? '불러오는 중...' : '데이터 새로고침'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsModal;
