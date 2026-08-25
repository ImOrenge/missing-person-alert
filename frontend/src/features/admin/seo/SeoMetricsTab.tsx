import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ExternalLink, Map, MessageSquarePlus, MousePointerClick, RefreshCw, RotateCcw, Search, Share2 } from 'lucide-react';
import { getSeoMetrics, type SeoMetricsRange } from '../../../services/seoMetricsService';
import type { SeoMetricsResponse, SeoPageGroupName, SeoSourceName } from '../../../types/seoMetrics';

const RANGES: SeoMetricsRange[] = [7, 28, 90];
const SOURCE_LABELS: Record<SeoSourceName, string> = {
  google: 'Google',
  naver: '네이버',
  bing: 'Bing',
  daum: '다음·카카오',
  direct: '직접·내부 이동',
  other: '기타 외부',
};
const PAGE_GROUP_LABELS: Record<SeoPageGroupName, string> = {
  home: '홈페이지', nationwide: '전국 허브', region: '지역 허브', type: '유형 허브', recent: '최근 실종자',
  statistics: '공개 현황 통계', guide: '대응 가이드', detail: '개별 상세', other: '기타',
};

const formatCount = (value: number) => new Intl.NumberFormat('ko-KR').format(value);
const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export default function SeoMetricsTab() {
  const [range, setRange] = useState<SeoMetricsRange>(28);
  const [data, setData] = useState<SeoMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      setData(await getSeoMetrics(range, signal));
    } catch (requestError: any) {
      if (requestError?.name === 'CanceledError' || requestError?.name === 'AbortError') return;
      setData(null);
      setError(requestError?.response?.data?.error || requestError?.message || '검색 전환 지표를 불러오지 못했습니다.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const sourceRows = useMemo(() => {
    if (!data) return [];
    return data.sourceBuckets.map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      count: data.summary.totals.sourceEntries[source] || 0,
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  const pageGroupRows = useMemo(() => {
    if (!data) return [];
    return data.pageGroupBuckets.map((pageGroup) => ({
      pageGroup,
      label: PAGE_GROUP_LABELS[pageGroup],
      count: data.summary.totals.pageGroupEntries[pageGroup] || 0,
    })).sort((a, b) => b.count - a.count);
  }, [data]);

  return (
    <section aria-labelledby="seo-metrics-title" className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Organic search funnel</p>
          <h2 id="seo-metrics-title" className="mt-1 text-xl font-black text-slate-950">검색 유입 전환 대시보드</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">자연검색 랜딩에서 상세 조회·지도 확인·공유·온라인 제보·전화 신고로 이어지는 행동을 익명 합계로 확인합니다.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-50">
          <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />새로고침
        </button>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="조회 기간">
        {RANGES.map((days) => <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days)} className={`min-h-10 rounded-full px-4 text-sm font-bold ${range === days ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>최근 {days}일</button>)}
      </div>

      {loading && <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">검색 전환 지표를 불러오는 중입니다.</div>}
      {!loading && error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900"><strong>지표 조회 실패</strong><p className="mt-1">{error}</p><button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-lg bg-red-700 px-4 font-bold text-white">다시 시도</button></div>}

      {!loading && data && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard icon={<Search size={18} />} label="자연검색 랜딩" value={formatCount(data.summary.totals.searchEntries)} note="Google·네이버·Bing·다음 검색 유입" />
          <MetricCard icon={<MousePointerClick size={18} />} label="검색 후 상세 진입" value={formatCount(data.summary.totals.detailStarts)} note={`검색 랜딩 대비 ${formatPercent(data.summary.rates.searchToDetailRate)} · 목표 40% 이상`} />
          <MetricCard icon={<BarChart3 size={18} />} label="공개 상세 조회" value={formatCount(data.summary.totals.detailViews)} note="1.2초 이상 표시·세션 중복 제외" />
          <MetricCard icon={<Map size={18} />} label="지도 확인" value={formatCount(data.summary.totals.mapClicks)} note={`상세 조회 대비 ${formatPercent(data.summary.rates.mapViewRate)}`} />
          <MetricCard icon={<Share2 size={18} />} label="공유 시작" value={formatCount(data.summary.totals.shares)} note={`상세 조회 대비 ${formatPercent(data.summary.rates.shareRate)}`} />
          <MetricCard icon={<MessageSquarePlus size={18} />} label="온라인 제보 진입" value={formatCount(data.summary.totals.reportStarts)} note={`상세 조회 대비 ${formatPercent(data.summary.rates.reportStartRate)}`} />
          <MetricCard icon={<MousePointerClick size={18} />} label="112·182 전화 선택" value={formatCount(data.summary.totals.calls112 + data.summary.totals.calls182)} note={`상세 조회 대비 ${formatPercent(data.summary.rates.callRate)}`} />
          <MetricCard icon={<RotateCcw size={18} />} label="검색 유입 후 재방문 신호" value={formatCount(data.summary.totals.returnVisits)} note={`기간 내 검색 랜딩 대비 ${formatPercent(data.summary.rates.returnVisitRate)}`} />
        </div>

        {data.summary.daily.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>아직 수집된 지표가 없습니다.</strong><p>계측 코드가 운영에 배포된 뒤 실제 사용자 행동부터 날짜별로 집계됩니다.</p></div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-black text-slate-950">일별 전환 추이</h3><p className="mt-1 text-xs text-slate-500">{data.summary.startDate} – {data.summary.endDate}</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">날짜별 검색 랜딩과 상세·지도·공유·제보 전환 건수</caption><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th scope="col" className="px-4 py-3">날짜</th><th scope="col" className="px-4 py-3 text-right">검색 랜딩</th><th scope="col" className="px-4 py-3 text-right">상세 진입</th><th scope="col" className="px-4 py-3 text-right">전체 상세</th><th scope="col" className="px-4 py-3 text-right">지도</th><th scope="col" className="px-4 py-3 text-right">공유</th><th scope="col" className="px-4 py-3 text-right">제보</th></tr></thead><tbody className="divide-y divide-slate-100">{data.summary.daily.map((day) => <tr key={day.date}><th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">{day.date}</th><td className="px-4 py-3 text-right">{formatCount(day.searchEntries)}</td><td className="px-4 py-3 text-right">{formatCount(day.detailStarts)}</td><td className="px-4 py-3 text-right">{formatCount(day.detailViews)}</td><td className="px-4 py-3 text-right">{formatCount(day.mapClicks)}</td><td className="px-4 py-3 text-right">{formatCount(day.shares)}</td><td className="px-4 py-3 text-right">{formatCount(day.reportStarts)}</td></tr>)}</tbody></table></div>
        </div>}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="seo-source-title"><h3 id="seo-source-title" className="font-black text-slate-950">검색 채널별 랜딩</h3><ul className="mt-4 space-y-3">{sourceRows.map((row) => <li key={row.source} className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{row.label}</span><strong className="text-sm text-slate-950">{formatCount(row.count)}건</strong></li>)}</ul></section>
          <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950"><h3 className="font-black">측정 해석</h3><p className="mt-2">{data.measurementNote}</p><p className="mt-2"><strong>계측 기준 변경:</strong> 2026년 8월 24일 21:44(KST)부터 지도·공유·제보·전화 행동은 같은 브라우저 세션과 사건에서 행동별 1회만 집계합니다. 그 이전 CTA 합계에는 반복 클릭이 포함될 수 있으므로 전환율 추세는 변경 시점 이후 데이터로 판정합니다.</p><p className="mt-2">재방문은 최초 검색 유입 6시간 뒤 같은 브라우저에서 다시 공개 상세를 본 신호이며, 사람을 식별하거나 코호트를 추적하지 않는 방향성 지표입니다.</p><p className="mt-2">앱·브라우저가 리퍼러를 숨기면 검색 유입도 직접 유입으로 집계될 수 있으므로, 최종 자연검색 클릭·노출은 Search Console과 함께 판단해야 합니다.</p><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-black underline">Search Console 열기<ExternalLink size={14} aria-hidden="true" /></a></aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="seo-page-group-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 id="seo-page-group-title" className="font-black text-slate-950">랜딩 페이지 그룹 비중</h3><p className="mt-1 text-xs text-slate-500">검색엔진이 전달한 리퍼러 기준이며 실제 노출 비중은 Search Console에서 최종 판정합니다.</p></div><div className="text-sm text-slate-700"><strong>홈 {formatPercent(data.summary.rates.homeSearchShare)}</strong> · 확장 허브 {formatPercent(data.summary.rates.expansionSearchShare)}</div></div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pageGroupRows.map((row) => <li key={row.pageGroup} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm text-slate-600">{row.label}</span><strong className="text-sm text-slate-950">{formatCount(row.count)}건</strong></li>)}</ul>
          <p className="mt-4 text-xs text-slate-500">확장 허브는 유형·최근·통계·가이드의 합계이며 목표는 30% 이상, 홈페이지 의존도 목표는 40% 이하입니다.</p>
        </section>
      </>}
    </section>
  );
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-sm font-bold text-slate-600"><span className="text-blue-700" aria-hidden="true">{icon}</span>{label}</div><strong className="mt-3 block text-3xl font-black tabular-nums text-slate-950">{value}</strong><p className="mt-1 text-xs text-slate-500">{note}</p></article>;
}
