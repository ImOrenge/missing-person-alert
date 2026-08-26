import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, FileSearch, Loader2, MapPin, Newspaper, Search, ShieldCheck } from 'lucide-react';
import { fetchSearchSuggestions, searchPublicRecords } from '../../services/searchService';
import type { PublicSearchItem, PublicSearchResponse, PublicSearchTab } from '../../types/search';
import { useSearchState } from './use-search-state';
import CaseImpressionTracker from '../../components/analytics/CaseImpressionTracker';
import { logPublicImpactEvent } from '../../services/analyticsService';
import { getSidoCode, PUBLIC_IMPACT_EVENT_NAMES } from '../../services/analytics/events';

interface SearchPageProps {
  enabled: boolean;
  onOpenMap: () => void;
}

const TABS: Array<{ id: PublicSearchTab; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'cases', label: '공식 사건' },
  { id: 'reports', label: '승인 제보' },
  { id: 'news', label: '뉴스' },
];

const kindLabel: Record<PublicSearchItem['kind'], string> = {
  case: '공식 사건',
  report: '승인 제보',
  news: '뉴스',
};

export default function SearchPage({ enabled, onOpenMap }: SearchPageProps) {
  const { state, commit } = useSearchState();
  const [draftQuery, setDraftQuery] = useState(state.q);
  const [draftRegion, setDraftRegion] = useState(state.region);
  const [result, setResult] = useState<PublicSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; label: string; regionLabel?: string; href: string }>>([]);
  const trackedResult = useRef<PublicSearchResponse | null>(null);

  useEffect(() => {
    if (!result || result.items.length === 0 || trackedResult.current === result) return;
    trackedResult.current = result;
    logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.SEARCH_RESULT_VIEW, {
      surface: 'search',
      ...(getSidoCode(state.region) ? { sido_code: getSidoCode(state.region) } : {}),
    });
  }, [result, state.region]);

  useEffect(() => {
    const query = draftQuery.trim();
    if (!enabled || query.length < 2 || query === state.q) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSearchSuggestions(query, controller.signal)
        .then(setSuggestions)
        .catch(() => !controller.signal.aborted && setSuggestions([]));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draftQuery, enabled, state.q]);

  useEffect(() => {
    if (!enabled || state.q.trim().length < 2) {
      setResult(null);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchPublicRecords(state, controller.signal)
      .then(setResult)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        const message = requestError instanceof Error ? requestError.message : '검색 결과를 불러오지 못했습니다.';
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, state]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draftQuery.trim().length < 2) {
      setError('검색어는 2자 이상 입력해 주세요.');
      return;
    }
    const sidoCode = getSidoCode(draftRegion);
    if (draftRegion.trim() && sidoCode) {
      logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.REGION_FILTER, {
        sido_code: sidoCode,
        surface: 'search',
      });
    }
    commit({ ...state, q: draftQuery, region: draftRegion });
  };

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <FileSearch className="mx-auto text-slate-300" size={44} />
        <h2 className="mt-4 text-xl font-black text-slate-950">통합 검색을 준비하고 있습니다</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">개인정보·비용 검토가 완료될 때까지 기존 지도와 대시보드 검색을 이용해 주세요.</p>
        <button type="button" onClick={onOpenMap} className="mt-5 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">지도에서 찾기</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" role="search">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <label className="relative block">
              <span className="sr-only">이름, 지역, 인상착의 검색</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
              <input role="combobox" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} maxLength={80} autoComplete="off" aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-controls="public-search-suggestions" placeholder="이름·지역·인상착의 검색" className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" />
            </label>
            {suggestions.length > 0 && <div id="public-search-suggestions" role="listbox" className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" role="option" aria-selected="false" onClick={() => { setDraftQuery(suggestion.label); setSuggestions([]); commit({ ...state, q: suggestion.label }); }} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50"><strong className="truncate text-slate-900">{suggestion.label}</strong><span className="flex-none text-xs text-slate-400">{suggestion.regionLabel || '공식 사건'}</span></button>)}</div>}
          </div>
          <label className="sm:w-52">
            <span className="sr-only">지역 필터</span>
            <input value={draftRegion} onChange={(event) => setDraftRegion(event.target.value)} maxLength={40} autoComplete="off" placeholder="지역(선택)" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" />
          </label>
          <button type="submit" className="h-11 rounded-lg bg-[#1e3a5f] px-5 text-sm font-black text-white hover:bg-[#162f4e]">검색</button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto" aria-label="검색 결과 종류">
          {TABS.map((tab) => <button key={tab.id} type="button" onClick={() => commit({ ...state, tab: tab.id })} aria-pressed={state.tab === tab.id} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${state.tab === tab.id ? 'bg-[#10213a] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{tab.label}</button>)}
        </div>
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-700">{result ? `검색 결과 ${result.total}건${result.capped ? ' 이상' : ''}` : '공개 정보 통합 검색'}</p>
        <p className="flex items-center gap-1 text-xs text-slate-500"><ShieldCheck size={14} aria-hidden="true" /> 공식·승인 공개정보만 표시</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500" role="status"><Loader2 className="mx-auto mb-3 animate-spin" size={28} />검색 중입니다</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700" role="alert"><AlertCircle className="mr-2 inline" size={17} />{error}</div>
      ) : result && result.items.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((item) => (
            <CaseImpressionTracker key={`${item.kind}:${item.id}`} caseKey={item.id} caseCategory="unknown" address={item.regionLabel} surface="search" enabled={item.kind === 'case'}>
              {(impressionRef) => (
                <li ref={impressionRef}>
                  <a href={item.href} target={item.kind === 'news' ? '_blank' : undefined} rel={item.kind === 'news' ? 'noopener noreferrer' : undefined} className="group flex gap-4 p-4 hover:bg-slate-50 sm:p-5">
                    <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                      {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : item.kind === 'news' ? <Newspaper size={25} /> : <FileSearch size={25} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-[#1e3a5f]">{kindLabel[item.kind]}</span>{item.statusLabel && <span className="text-xs font-bold text-slate-500">{item.statusLabel}</span>}</div>
                      <h2 className="mt-1.5 truncate font-black text-slate-950 group-hover:text-[#1e3a5f]">{item.title}</h2>
                      <p className={`mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600 ${item.kind === 'report' ? '' : 'line-clamp-2'}`}>{item.summary}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">{item.regionLabel && <span className="flex items-center gap-1"><MapPin size={13} />{item.regionLabel}</span>}<span>{item.sourceLabel}</span></div>
                    </div>
                    <ArrowRight className="mt-6 flex-none text-slate-300 group-hover:text-[#1e3a5f]" size={18} aria-hidden="true" />
                  </a>
                </li>
              )}
            </CaseImpressionTracker>
          ))}
        </ul>
      ) : state.q ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center"><Search className="mx-auto text-slate-300" size={32} /><p className="mt-3 text-sm font-bold text-slate-600">조건에 맞는 공개 정보가 없습니다.</p><button type="button" onClick={() => { setDraftRegion(''); commit({ q: state.q, tab: 'all', region: '' }); }} className="mt-3 text-sm font-black text-[#1e3a5f]">필터 초기화</button></div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center"><Search className="mx-auto text-slate-300" size={32} /><p className="mt-3 text-sm font-bold text-slate-600">찾고 싶은 이름·지역·인상착의를 입력하세요.</p></div>
      )}
    </div>
  );
}
