import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, FileSearch, MapPin, Plus, Search, ShieldCheck } from 'lucide-react';
import { fetchPublicReportFeed } from '../../services/exploreService';
import type { PublicReportFeedResponse } from '../../services/exploreService';
import type { PublicMapReportDto } from '../../types/publicReport';

interface PublicReportsPageProps {
  enabled: boolean;
  onOpenMap: (reportId: string) => void;
  onStartReport: () => void;
}

type StatusFilter = 'all' | PublicMapReportDto['publicStatus'];

const STATUS_LABELS: Record<PublicMapReportDto['publicStatus'], string> = {
  approved: '운영 검토 완료',
  forwarded: '관계기관 전달',
  confirmed: '관계기관 확인',
};

const getRegion = (location: string) => {
  const tokens = location.trim().split(/\s+/).filter(Boolean);
  return tokens.find((token) => token !== '대한민국') || '지역 미상';
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '시각 확인 필요' : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function PublicReportsPage({ enabled, onOpenMap, onStartReport }: PublicReportsPageProps) {
  const [feed, setFeed] = useState<PublicReportFeedResponse>({ items: [], total: 0, capped: false });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [region, setRegion] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setFeed({ items: [], total: 0, capped: false });
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPublicReportFeed(controller.signal)
      .then(setFeed)
      .catch((requestError) => {
        if (requestError?.name !== 'CanceledError' && requestError?.name !== 'AbortError') setError('공개 제보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, reloadKey]);

  const regions = useMemo(() => Array.from(new Set(feed.items.map((item) => getRegion(item.publicLocationText)))).sort((a, b) => a.localeCompare(b, 'ko-KR')), [feed.items]);
  const items = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase('ko-KR');
    return feed.items.filter((item) => {
      if (status !== 'all' && item.publicStatus !== status) return false;
      if (region !== 'all' && getRegion(item.publicLocationText) !== region) return false;
      if (!query) return true;
      return `${item.publicDescription} ${item.publicLocationText}`.toLocaleLowerCase('ko-KR').includes(query);
    });
  }, [feed.items, keyword, region, status]);

  if (!enabled) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center"><FileSearch className="mx-auto text-amber-600" size={40} /><h2 className="mt-4 text-xl font-black text-amber-950">사용자 제보 공개 페이지를 준비 중입니다</h2><p className="mt-2 text-sm text-amber-800">운영 검토와 개인정보 보호 절차가 활성화되면 공개 승인된 제보만 이곳에 표시합니다.</p><button type="button" onClick={onStartReport} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#10213a] px-4 py-2.5 text-sm font-black text-white"><Plus size={16} />비공개로 제보 접수</button></section>;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="공개 제보 필터">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative"><span className="sr-only">공개 제보 검색</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="공개 내용·지역 검색" className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-[#1e3a5f]" /></label>
          <label><span className="sr-only">검토 상태</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 lg:w-44"><option value="all">모든 검토 상태</option><option value="approved">운영 검토 완료</option><option value="forwarded">관계기관 전달</option><option value="confirmed">관계기관 확인</option></select></label>
          <label><span className="sr-only">지역</span><select value={region} onChange={(event) => setRegion(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 lg:w-40"><option value="all">모든 지역</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span><strong className="text-slate-800">{items.length}</strong>건 표시 · 최신 목격 시각순</span><span className="flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" />운영 검토를 통과한 공개 정보만 표시</span></div>
      </section>

      {feed.capped && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status"><AlertTriangle className="mt-0.5 flex-none" size={18} />최근 공개 제보 중 최대 조회 건수까지만 표시하고 있습니다. 검색 조건을 이용해 필요한 정보를 확인해주세요.</div>}

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">검토된 사용자 제보를 불러오는 중입니다.</div> : error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center"><p className="font-bold text-red-700" role="alert">{error}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-700">다시 시도</button></div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center"><FileSearch className="mx-auto text-slate-300" size={40} /><h2 className="mt-4 font-black text-slate-800">조건에 맞는 공개 제보가 없습니다</h2><p className="mt-2 text-sm text-slate-500">필터를 초기화하거나 확인한 사실을 비공개로 접수해주세요.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => { setKeyword(''); setStatus('all'); setRegion('all'); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">필터 초기화</button><button type="button" onClick={onStartReport} className="rounded-lg bg-[#d94841] px-4 py-2 text-sm font-black text-white">제보하기</button></div></div> : (
        <section className="grid gap-4 md:grid-cols-2" aria-label="검토된 사용자 제보 목록">
          {items.map((item) => <article key={item.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">{STATUS_LABELS[item.publicStatus]}</span><time className="text-xs text-slate-400" dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></div><p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-7 text-slate-800">{item.publicDescription}</p><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><p className="flex items-start gap-2"><MapPin className="mt-0.5 flex-none text-[#1e3a5f]" size={15} /><span><strong className="block text-slate-800">{item.publicLocationText}</strong><span className="mt-1 block">지도 좌표는 약 {item.publicRadiusM.toLocaleString()}m 안전 반경으로 비식별화</span></span></p></div><p className="mt-3 text-[11px] leading-5 text-slate-500">{item.sourceLabel} · 공식 확인 정보와 다를 수 있습니다.</p><div className="mt-auto flex flex-wrap gap-2 pt-5"><button type="button" onClick={() => onOpenMap(item.id)} className="flex items-center gap-1 rounded-lg bg-[#10213a] px-3 py-2 text-xs font-black text-white">지도에서 보기 <ArrowRight size={14} /></button>{item.caseId && <a href={item.href} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">공식 사건 보기 <ArrowRight size={14} /></a>}</div></article>)}
        </section>
      )}
    </div>
  );
}
