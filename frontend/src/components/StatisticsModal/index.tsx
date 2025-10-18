import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Calendar, Info, RefreshCw, X } from 'lucide-react';
import { useRegionStatsData, type RegionStatsRange } from '../../hooks/useRegionStatsData';
import type { AggregatedRegionStats } from '../../hooks/useRegionStatsData';

interface StatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
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

const computeTopRegions = (regions: AggregatedRegionStats[]) => regions.slice(0, 3);

const computeHasFreshData = (updatedAt?: number) => {
  if (!updatedAt) return false;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Date.now() - updatedAt < ONE_DAY_MS;
};

const RegionBarChart: React.FC<{ data: AggregatedRegionStats[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
        <BarChart3 className="mb-3 h-8 w-8 text-gray-300" />
        <p>선택한 기간에 대한 지역별 데이터가 없습니다.</p>
      </div>
    );
  }

  const maxValue = data.reduce((max, region) => Math.max(max, region.totalInRange), 0);

  return (
    <div className="space-y-3">
      {data.map((region) => {
        const ratio = maxValue > 0 ? Math.max((region.totalInRange / maxValue) * 100, 4) : 4;
        return (
          <div
            key={region.regionId}
            className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.25)] transition hover:shadow-[0_16px_32px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-center justify-between text-sm font-medium text-slate-700">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-600">
                  {region.regionName.slice(0, 2)}
                </span>
                {region.regionName}
              </span>
              <span className="text-sm font-semibold text-slate-800" aria-label={`${region.regionName} 건수`}>
                {region.totalInRange.toLocaleString()}건
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={region.totalInRange} aria-valuemin={0} aria-valuemax={maxValue}>
              <div
                className="h-2 rounded-full bg-gradient-to-r from-red-500 to-red-600"
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
                  <Calendar className="h-3 w-3" />
                  최근 신고 {region.latestCaseDate}
                </span>
              )}
            </div>
          </div>
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

const StatisticsModal: React.FC<StatisticsModalProps> = ({ isOpen, onClose }) => {
  const [range, setRange] = useState<RegionStatsRange>('week');
  const { loading, error, regions, totals, refreshedAt, refresh } = useRegionStatsData(isOpen, range);

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
      refresh();
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, refresh]);

  const topRegions = useMemo(() => computeTopRegions(regions), [regions]);
  const updatedAtText = formatKoreanDateTime(refreshedAt);
  const hasFreshData = computeHasFreshData(refreshedAt);

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
              {updatedAtText ? (
                <span>최신 업데이트: {updatedAtText}</span>
              ) : (
                <span>업데이트 시각을 불러오는 중...</span>
              )}
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
              onClick={() => refresh(true)}
              className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-red-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
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

          <div className="grid gap-5 lg:grid-cols-[2fr,3fr]">
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
                      <div key={region.regionId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
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

              <div className="rounded-2xl bg-white p-4 text-xs text-slate-500 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Info className="h-4 w-4" />
                  데이터 출처 및 안내
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Firestore `stats/regionDaily` 컬렉션에 저장된 집계 데이터를 기반으로 합니다.</li>
                  <li>데이터는 1시간마다 Cloud Functions 스케줄러를 통해 갱신됩니다.</li>
                  <li>실종 신고 기준이며, 접속·조회 통계와는 무관합니다.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-100">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">지역별 신고 추이</h3>
              {loading && (
                <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  통계 데이터를 불러오는 중입니다...
                </div>
              )}
              <RegionBarChart data={regions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsModal;
