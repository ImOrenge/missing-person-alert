import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, BarChart3, ExternalLink, Info, ShieldCheck, TrendingUp} from 'lucide-react';
import {logCustomEvent, logPublicImpactEvent} from '../../services/analyticsService';
import {PUBLIC_IMPACT_EVENT_NAMES} from '../../services/analytics/events';
import {loadPublicStatistics, type StatisticsLoadResult} from './statisticsService';
import type {PoliceStatisticsYear, StatisticsCategoryKey, StatisticsMetric} from './types';

interface PublicStatisticsPageProps {
  onOpenCases: (category?: StatisticsCategoryKey) => void;
}

const CATEGORY_META: Array<{key: StatisticsCategoryKey; label: string; short: string; color: string}> = [
  {key:'children',label:'18세 미만 아동',short:'아동',color:'#d94841'},
  {key:'disabled',label:'지적·자폐성·정신장애인',short:'장애인',color:'#2563eb'},
  {key:'dementia',label:'치매환자',short:'치매',color:'#7c3aed'},
  {key:'adult',label:'가출인(실종성인)',short:'성인',color:'#0f766e'},
];
const number = new Intl.NumberFormat('ko-KR');

const setStatisticsQuery = (year: number, metric: StatisticsMetric) => {
  const url = new URL(window.location.href);
  url.searchParams.set('year', String(year));
  url.searchParams.set('metric', metric);
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const TrendBars = ({items}: {items: PoliceStatisticsYear[]}) => {
  const max = Math.max(...items.flatMap((item) => CATEGORY_META.map(({key}) => item.categories[key].received)));
  return <div className="space-y-4" role="img" aria-label="2021년부터 2025년까지 분류별 접수 추이">
    {items.map((item) => <div key={item.year} className="grid gap-2 sm:grid-cols-[52px_1fr]"><strong className="text-sm text-slate-700">{item.year}</strong><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{CATEGORY_META.map(({key,short,color}) => <div key={key} className="rounded-lg bg-slate-100 p-2" tabIndex={0} aria-label={`${item.year}년 ${short} 접수 ${number.format(item.categories[key].received)}건`}><span className="text-[11px] font-bold text-slate-600">{short}</span><div className="mt-1 h-2 rounded-full bg-white"><span className="block h-2 rounded-full" style={{width:`${Math.max(2,item.categories[key].received/max*100)}%`,backgroundColor:color}} /></div><span className="mt-1 block text-[11px] font-black text-slate-900">{number.format(item.categories[key].received)}</span></div>)}</div></div>)}
  </div>;
};

const TotalTrendBars = ({items}: {items: PoliceStatisticsYear[]}) => {
  const maxReceived = Math.max(...items.map((item) => item.totals.received));
  const maxUnresolved = Math.max(...items.map((item) => item.totals.unresolved));
  return <div className="space-y-3" role="img" aria-label="연도별 전체 접수와 원자료 미해제 열 합계 추이">
    {items.map((item) => <div key={item.year} className="grid gap-2 sm:grid-cols-[52px_1fr]"><strong className="text-sm text-slate-700">{item.year}</strong><div className="space-y-1.5"><div className="flex items-center gap-2"><span className="w-12 text-[11px] font-bold text-slate-500">접수</span><span className="h-3 rounded-full bg-[#1e3a5f]" style={{width:`${Math.max(4,item.totals.received/maxReceived*100)}%`}} /><span className="text-[11px] font-black">{number.format(item.totals.received)}</span></div><div className="flex items-center gap-2"><span className="w-12 text-[11px] font-bold text-slate-500">미해제</span><span className="h-3 rounded-full bg-amber-500" style={{width:`${Math.max(4,item.totals.unresolved/maxUnresolved*100)}%`}} /><span className="text-[11px] font-black">{number.format(item.totals.unresolved)}</span></div></div></div>)}
  </div>;
};

export default function PublicStatisticsPage({onOpenCases}: PublicStatisticsPageProps) {
  const params = new URLSearchParams(window.location.search);
  const requestedYear = Number(params.get('year'));
  const requestedMetric = params.get('metric') === 'unresolved' ? 'unresolved' : 'received';
  const [result, setResult] = useState<StatisticsLoadResult | null>(null);
  const [metric, setMetric] = useState<StatisticsMetric>(requestedMetric);
  const [selectedYear, setSelectedYear] = useState(Number.isInteger(requestedYear) ? requestedYear : 0);
  const [invalidYearNotice, setInvalidYearNotice] = useState(false);
  const trackedView = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicStatistics(controller.signal).then(setResult).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const items = useMemo(() => result?.items || [], [result]);
  const latestYear = items[items.length - 1]?.year || 0;
  useEffect(() => {
    if (!latestYear) return;
    const exists = items.some((item) => item.year === selectedYear);
    if (!exists) {
      setInvalidYearNotice(selectedYear > 0);
      setSelectedYear(latestYear);
      const url = new URL(window.location.href);
      url.searchParams.set('year', String(latestYear));
      url.searchParams.set('metric', metric);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [items, latestYear, metric, selectedYear]);

  useEffect(() => {
    if (items.length && !trackedView.current) {
      trackedView.current = true;
      logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.STATISTICS_VIEW, {route_group: 'statistics'});
    }
  }, [items.length]);

  const selected = useMemo(() => items.find((item) => item.year === selectedYear) || items[items.length - 1], [items, selectedYear]);
  if (!selected || !result) return <div className="grid gap-4" aria-label="공식 통계 불러오는 중"><div className="h-36 animate-pulse rounded-2xl bg-slate-200" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1,2,3,4].map((key) => <div key={key} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}</div></div>;

  const changeYear = (value: number) => {
    setSelectedYear(value); setInvalidYearNotice(false); setStatisticsQuery(value, metric);
    logCustomEvent('statistics_filter', {filter_name: 'year'});
  };
  const changeMetric = (value: StatisticsMetric) => {
    setMetric(value); setStatisticsQuery(selected.year, value);
    logCustomEvent('statistics_filter', {filter_name: 'metric'});
  };
  const openCases = (category?: StatisticsCategoryKey) => {
    logCustomEvent('statistics_to_cases_click', {target: category || 'map'});
    onOpenCases(category);
  };
  const yoy = selected.derived.yearOverYearPercent.received;

  return <div className="space-y-6">
    {result.stale && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Info size={17} className="mt-0.5 shrink-0" /><span>검증된 2021~2025 snapshot을 표시하고 있습니다. Firestore 게시본 갱신 상태는 확인 중입니다.</span></div>}
    {invalidYearNotice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">요청한 연도가 없어 최신 공개 연도인 {latestYear}년으로 이동했습니다.</div>}

    <section className="overflow-hidden rounded-2xl bg-[#10213a] p-5 text-white shadow-lg sm:p-7" aria-labelledby="statistics-overview-title">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[0.18em] text-cyan-300">POLICE OPEN DATA / YEARLY SNAPSHOT</p><h2 id="statistics-overview-title" className="mt-2 text-2xl font-black sm:text-3xl">{selected.year}년 실종아동등·가출인 접수 현황</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">경찰청 원자료의 분류별 접수·해제·미해제 열을 동일한 기준으로 비교합니다.</p></div><div className="flex gap-2"><label className="text-xs font-bold text-slate-200">연도<select aria-label="통계 연도" value={selected.year} onChange={(event) => changeYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-black text-slate-950">{items.map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}</select></label><label className="text-xs font-bold text-slate-200">지표<select aria-label="통계 지표" value={metric} onChange={(event) => changeMetric(event.target.value as StatisticsMetric)} className="mt-1 block rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-black text-slate-950"><option value="received">접수</option><option value="unresolved">미해제 열</option></select></label></div></div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-slate-300">전체 접수</span><strong className="mt-1 block text-2xl">{number.format(selected.totals.received)}</strong></div><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-slate-300">일평균 접수</span><strong className="mt-1 block text-2xl">약 {number.format(Math.round(selected.derived.dailyAverageReceived))}</strong><small className="text-slate-400">{selected.derived.daysInYear}일 기준</small></div><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-slate-300">취약계층 접수</span><strong className="mt-1 block text-2xl">{number.format(selected.totals.vulnerableReceived)}</strong></div><div className="rounded-xl bg-white/10 p-4"><span className="text-xs text-slate-300">원자료 미해제 열 합계</span><strong className="mt-1 block text-2xl text-amber-300">{number.format(selected.totals.unresolved)}</strong></div></div>
    </section>

    <section aria-labelledby="category-kpi-title"><div className="mb-3 flex items-center gap-2"><BarChart3 size={18} className="text-[#1e3a5f]" /><h2 id="category-kpi-title" className="text-lg font-black text-slate-950">분류별 {metric === 'received' ? '접수' : '미해제 열'}</h2></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{CATEGORY_META.map(({key,label,color}) => <button key={key} type="button" onClick={() => openCases(key)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="block h-1.5 w-10 rounded-full" style={{backgroundColor:color}} /><span className="mt-3 block text-xs font-bold leading-5 text-slate-500">{label}</span><strong className="mt-1 block text-xl text-slate-950">{number.format(selected.categories[key][metric])}</strong><span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-[#1e3a5f]">현재 사건 보기 <ArrowRight size={13} /></span></button>)}</div></section>

    <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="category-trend-title"><h2 id="category-trend-title" className="text-base font-black text-slate-950">분류별 접수 추이</h2><p className="mt-1 text-xs text-slate-500">단위: 건 · 2021~{latestYear}</p><div className="mt-5"><TrendBars items={items} /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="total-trend-title"><h2 id="total-trend-title" className="text-base font-black text-slate-950">전체 접수·미해제 열 추이</h2><p className="mt-1 text-xs text-slate-500">두 지표는 각각의 최댓값에 맞춰 표시합니다.</p><div className="mt-5"><TotalTrendBars items={items} /></div></section></div>

    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5" aria-labelledby="interpretation-title"><div className="flex items-center gap-2"><TrendingUp size={18} className="text-blue-800" /><h2 id="interpretation-title" className="font-black text-blue-950">읽는 방법</h2></div><p className="mt-3 text-sm leading-6 text-blue-950">{typeof yoy === 'number' ? `${selected.year}년 전체 접수는 전년보다 ${Math.abs(yoy).toFixed(1)}% ${yoy >= 0 ? '증가' : '감소'}했습니다.` : '연속된 이전 연도가 없어 전년 대비 값을 계산하지 않았습니다.'}</p><p className="mt-2 text-sm leading-6 text-blue-900">미해제 열 합계는 이전 연도 이월 등 원자료 정의의 영향을 받을 수 있어, 사람 수나 해당 연도 발생 사건의 잔여 건수로 단정하지 않습니다.</p></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="statistics-table-title"><div className="border-b border-slate-200 p-5"><h2 id="statistics-table-title" className="font-black text-slate-950">동일 데이터 표</h2><p className="mt-1 text-xs text-slate-500">차트의 모든 값을 키보드와 스크린리더로 확인할 수 있습니다.</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">2021년부터 {latestYear}년까지 경찰청 연도별 실종 통계</caption><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-3">연도</th><th className="px-4 py-3">전체 접수</th><th className="px-4 py-3">전체 해제</th><th className="px-4 py-3">미해제 열 합계</th><th className="px-4 py-3">취약계층 접수</th><th className="px-4 py-3">일평균 접수</th></tr></thead><tbody>{items.map((item) => <tr key={item.year} className="border-t border-slate-100"><th className="px-4 py-3 font-black">{item.year}</th><td className="px-4 py-3">{number.format(item.totals.received)}</td><td className="px-4 py-3">{number.format(item.totals.released)}</td><td className="px-4 py-3">{number.format(item.totals.unresolved)}</td><td className="px-4 py-3">{number.format(item.totals.vulnerableReceived)}</td><td className="px-4 py-3">{item.derived.dailyAverageReceived.toFixed(3)}</td></tr>)}</tbody></table></div></section>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-labelledby="statistics-source-title"><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-800" /><div><h2 id="statistics-source-title" className="font-black text-emerald-950">출처와 처리 방법</h2><p className="mt-2 text-sm leading-6 text-emerald-950">출처: 경찰청 「{selected.source.datasetTitle}」</p><p className="text-sm leading-6 text-emerald-900">데이터 기준일: {selected.source.datasetCutoff || '확인 중'} · MissingAlert 확인일: 2026-08-26</p><p className="text-sm leading-6 text-emerald-900">처리: CP949→UTF-8, 분류 합계, 윤년을 반영한 일평균, 전년 대비 계산</p><p className="text-sm leading-6 text-emerald-900">원본 hash: {selected.source.sourceHash.slice(0,12)}…</p><div className="mt-3 flex flex-wrap gap-2"><a href={selected.source.officialPageUrl || '#statistics-methodology'} target={selected.source.officialPageUrl ? '_blank' : undefined} rel={selected.source.officialPageUrl ? 'noopener noreferrer' : undefined} className="inline-flex items-center gap-1 rounded-lg bg-emerald-900 px-3 py-2 text-xs font-black text-white">공식 데이터 출처 <ExternalLink size={13} /></a><button type="button" onClick={() => document.getElementById('statistics-methodology')?.scrollIntoView({behavior:'smooth'})} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-950">데이터 처리 방법</button><button type="button" onClick={() => openCases()} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-950">현재 공개 사건 지도 <ArrowRight size={13} /></button></div></div></div></section>

    <details id="statistics-methodology" className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-black text-slate-950">방법론과 해석 주의사항</summary><ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600"><li>원본 bytes를 보존하고 SHA-256으로 동일 파일 재수입을 방지합니다.</li><li>미해제는 접수−해제로 재계산하지 않고 네 분류의 원자료 미해제 열을 합산합니다.</li><li>2024년 일평균은 윤년 366일, 그 밖의 연도는 해당 연도의 일수로 나눕니다.</li><li>공개 화면에는 원본 hash 앞 12자리만 표시하고 내부 Storage 경로와 실행 ID는 노출하지 않습니다.</li></ul></details>
  </div>;
}
