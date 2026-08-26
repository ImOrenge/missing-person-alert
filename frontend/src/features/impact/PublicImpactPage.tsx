import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Activity, ArrowRight, BarChart3, ExternalLink, Info, Map, MousePointerClick, Share2, ShieldCheck} from 'lucide-react';
import {logPublicImpactEvent} from '../../services/analyticsService';
import {PUBLIC_IMPACT_EVENT_NAMES} from '../../services/analytics/events';
import {loadPublicImpactMonths} from './impactService';
import type {PublicImpactMonth} from './types';

interface PublicImpactPageProps { onOpenMap: () => void; onOpenStatistics: () => void; }
const number = new Intl.NumberFormat('ko-KR');
const KPI = [
  {key:'caseImpressions',label:'실종정보 노출',description:'카드가 화면 50% 이상에서 1초 유지된 횟수',icon:Activity},
  {key:'caseViews',label:'상세조회',description:'공개 active 상세가 정상 렌더링된 횟수',icon:MousePointerClick},
  {key:'mapViews',label:'지도 탐색',description:'지도 화면이 정상 표시된 횟수',icon:Map},
  {key:'shareClicks',label:'정보 공유 UI 선택',description:'공유 채널을 선택하거나 Web Share를 호출한 횟수',icon:Share2},
  {key:'officialSourceClicks',label:'공식정보 이동',description:'공식 원문 경로로 이동한 횟수',icon:ExternalLink},
  {key:'reportCtaClicks',label:'제보·신고 경로 이동',description:'112 또는 공식 제보 경로를 선택한 횟수',icon:ArrowRight},
] as const;

const formatTimestamp = (value: unknown): string => {
  if (!value) return '확인 중';
  const raw = value as any;
  const milliseconds = typeof raw === 'string' ? Date.parse(raw) : typeof raw === 'number' ? raw : Number(raw.seconds ?? raw._seconds) * 1000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toLocaleString('ko-KR') : '확인 중';
};

export default function PublicImpactPage({onOpenMap,onOpenStatistics}: PublicImpactPageProps) {
  const requestedMonth = new URLSearchParams(window.location.search).get('month') || '';
  const [items,setItems] = useState<PublicImpactMonth[]>([]);
  const [stale,setStale] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [selectedMonth,setSelectedMonth] = useState(requestedMonth);
  const [fallbackNotice,setFallbackNotice] = useState(false);
  const tracked = useRef(false);

  useEffect(() => { const controller = new AbortController(); loadPublicImpactMonths(controller.signal).then((result) => {setItems(result.items);setStale(result.stale);setLoaded(true);}); return () => controller.abort(); }, []);
  const latestMonth = items[items.length-1]?.month || '';
  useEffect(() => {
    if (!latestMonth) return;
    if (!items.some((item) => item.month === selectedMonth)) {
      setFallbackNotice(Boolean(selectedMonth)); setSelectedMonth(latestMonth);
      const url = new URL(window.location.href); url.searchParams.set('month',latestMonth); window.history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`);
    }
  },[items,latestMonth,selectedMonth]);
  useEffect(() => { if (loaded && !stale && !tracked.current) {tracked.current=true;logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.IMPACT_VIEW,{route_group:'impact'});} },[loaded,stale]);
  const selected = useMemo(() => items.find((item) => item.month===selectedMonth) || items[items.length-1],[items,selectedMonth]);
  const recent = useMemo(() => items.slice(-12),[items]);

  if (!loaded) return <div aria-label="공익성과 불러오는 중" className="space-y-4"><div className="h-44 animate-pulse rounded-2xl bg-slate-200"/><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[1,2,3,4,5,6].map((key)=><div key={key} className="h-28 animate-pulse rounded-xl bg-slate-100"/>)}</div></div>;
  if (!selected) return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" aria-labelledby="impact-empty-title"><ShieldCheck size={42} className="mx-auto text-slate-300"/><h2 id="impact-empty-title" className="mt-4 text-xl font-black text-slate-950">{stale?'공익성과를 불러오지 못했습니다':'아직 공개 승인된 Impact 월이 없습니다'}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{stale?'이전에 확인한 공개 월도 없어 숫자를 표시하지 않습니다. 잠시 후 다시 확인해 주세요.':'집계 수치는 BigQuery 원시 이벤트와 일별 문서를 대조하고 운영 승인을 마친 뒤에만 공개합니다. 검증 전 숫자를 임의로 표시하지 않습니다.'}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={onOpenMap} className="rounded-lg bg-[#10213a] px-4 py-2 text-sm font-black text-white">현재 공개 사건 보기</button><button type="button" onClick={onOpenStatistics} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800">공식 통계 보기</button></div></section>;

  const maxImpressions = Math.max(1,...recent.map((item)=>item.events.caseImpressions));
  const changeMonth=(month:string)=>{setSelectedMonth(month);setFallbackNotice(false);const url=new URL(window.location.href);url.searchParams.set('month',month);window.history.pushState({},'',`${url.pathname}${url.search}${url.hash}`);};

  return <div className="space-y-6">
    {stale&&<div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Info size={17} className="mt-0.5 shrink-0"/>최신 요청에 실패해 이전에 확인한 공개 월을 표시합니다.</div>}
    {fallbackNotice&&<div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">요청한 월이 미래이거나 미공개 상태라 최신 승인 월인 {latestMonth}로 이동했습니다.</div>}
    <section className="rounded-2xl bg-[#10213a] p-6 text-white shadow-lg sm:p-8" aria-labelledby="impact-hero-title"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black tracking-[0.18em] text-cyan-300">MISSINGALERT PUBLIC IMPACT</p><h2 id="impact-hero-title" className="mt-2 text-2xl font-black sm:text-3xl">공개 실종정보가 시민 행동으로 이어진 과정</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">방문자 수가 아니라 정보 노출·상세조회·공유·공식 경로 이동을 엄격한 이벤트 정의로 집계합니다.</p></div><label className="text-xs font-bold text-slate-200">공개 월<select aria-label="Impact 공개 월" value={selected.month} onChange={(event)=>changeMonth(event.target.value)} className="mt-1 block rounded-lg bg-white px-3 py-2 text-sm font-black text-slate-950">{items.map((item)=><option key={item.month} value={item.month}>{item.month}</option>)}</select></label></div><div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300"><span className="rounded-full bg-white/10 px-3 py-1.5">집계 기준 {selected.aggregation.timezone||'Asia/Seoul'}</span><span className="rounded-full bg-white/10 px-3 py-1.5">방법론 v{selected.aggregation.methodologyVersion||1}</span><span className="rounded-full bg-white/10 px-3 py-1.5">검토 완료 {formatTimestamp(selected.review.reviewedAt)}</span></div></section>
    <section aria-labelledby="impact-kpi-title"><h2 id="impact-kpi-title" className="text-lg font-black text-slate-950">{selected.month} 공개 KPI</h2><p className="mt-1 text-sm text-slate-500">모든 값은 사람 수가 아닌 정의된 이벤트 발생 횟수입니다.</p><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{KPI.map(({key,label,description,icon:Icon})=><article key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Icon size={18} className="text-[#1e3a5f]"/><strong className="mt-3 block text-2xl text-slate-950">{number.format(selected.events[key]||0)}회</strong><h3 className="mt-1 text-sm font-black text-slate-800">{label}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{description}</p></article>)}</div></section>
    <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="impact-trend-title"><div className="flex items-center gap-2"><BarChart3 size={18} className="text-[#1e3a5f]"/><h2 id="impact-trend-title" className="font-black text-slate-950">월별 실종정보 노출 추이</h2></div><p className="mt-1 text-xs text-slate-500">최근 최대 12개 공개 승인 월 · 단위: 회</p><div className="mt-5 space-y-3" role="img" aria-label="월별 실종정보 노출 횟수 추이">{recent.map((item)=><div key={item.month} className="grid grid-cols-[72px_1fr_76px] items-center gap-2"><span className="text-xs font-bold text-slate-600">{item.month}</span><span className="h-3 rounded-full bg-slate-100"><span className="block h-3 rounded-full bg-[#d94841]" style={{width:`${Math.max(2,item.events.caseImpressions/maxImpressions*100)}%`}}/></span><strong className="text-right text-xs">{number.format(item.events.caseImpressions)}</strong></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="impact-supply-title"><h2 id="impact-supply-title" className="font-black text-slate-950">서비스 공급 지표</h2><dl className="mt-4 space-y-4"><div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">집계 시점 공개 active 사건</dt><dd className="mt-1 text-2xl font-black text-slate-950">{number.format(selected.service.activeCasesPublishedEndOfMonth||0)}건</dd><p className="mt-2 text-xs leading-5 text-slate-500">월말 역사 스냅샷이 아니라 월 draft를 다시 계산한 시점의 공개 건수입니다.</p></div><div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">월 distinct 추정 사용자</dt><dd className="mt-1 text-2xl font-black text-slate-950">{number.format(selected.estimatedUsers||0)}</dd><p className="mt-2 text-xs leading-5 text-slate-500">GA4 익명 식별자를 월 범위에서 중복 제거한 추정치이며 실제 시민 수로 단정하지 않습니다.</p></div></dl></section></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="impact-table-title"><div className="border-b border-slate-200 p-5"><h2 id="impact-table-title" className="font-black text-slate-950">공개 월별 상세 표</h2><p className="mt-1 text-xs text-slate-500">차트와 KPI의 정확값을 같은 단위로 제공합니다.</p></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><caption className="sr-only">MissingAlert 공개 Impact 월별 이벤트 횟수</caption><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="px-4 py-3">월</th>{KPI.map(({key,label})=><th key={key} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{items.map((item)=><tr key={item.month} className="border-t border-slate-100"><th className="px-4 py-3 font-black">{item.month}</th>{KPI.map(({key})=><td key={key} className="px-4 py-3">{number.format(item.events[key]||0)}</td>)}</tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-labelledby="impact-method-title"><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-800"/><div><h2 id="impact-method-title" className="font-black text-emerald-950">측정 방법과 한계</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-950"><li>노출은 50% 이상·1초·visible tab·동일 세션 사건 1회 조건입니다.</li><li>공유는 외부 앱의 실제 전송 완료가 아니라 공유 채널을 선택한 행동입니다.</li><li>제보·신고 경로 이동은 실제 제보 제출이나 발견 기여를 의미하지 않습니다.</li><li>Analytics export 지연을 보정하기 위해 D-3~D-1을 매일 다시 집계합니다.</li><li>공개 월은 BigQuery 원시 count와 일별 합계를 대조한 뒤 운영자가 승인합니다.</li></ul><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onOpenMap} className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-black text-white">현재 공개 사건</button><button type="button" onClick={onOpenStatistics} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-950">공식 연도별 통계</button></div></div></div></section>
  </div>;
}
