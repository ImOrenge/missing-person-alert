import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Filter, Info, RefreshCw } from 'lucide-react';
import { useNewsFeed } from '../../hooks/useNewsFeed';
import NewsList from './NewsList';

interface NewsFilters {
  from: string;
  to: string;
  articleId: string;
  caseId: string;
}

const readFiltersFromLocation = (): NewsFilters => {
  if (typeof window === 'undefined') return { from: '', to: '', articleId: '', caseId: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    from: params.get('from') || '',
    to: params.get('to') || '',
    articleId: params.get('articleId') || '',
    caseId: params.get('caseId') || '',
  };
};

export default function NewsPage() {
  const initialFilters = useMemo(readFiltersFromLocation, []);
  const [draftFrom, setDraftFrom] = useState(initialFilters.from);
  const [draftTo, setDraftTo] = useState(initialFilters.to);
  const [filters, setFilters] = useState(initialFilters);
  const news = useNewsFeed({
    limit: 20,
    from: filters.from || undefined,
    to: filters.to || undefined,
    caseId: filters.caseId || undefined,
  });
  const caseCriteria = [
    { label: '이름', value: news.searchCriteria?.name || news.caseContext?.name || '' },
    { label: '지역', value: news.searchCriteria?.region || '' },
    { label: '인상착의', value: news.searchCriteria?.appearance || '' },
  ].filter((criterion) => criterion.value);

  useEffect(() => {
    const syncLocation = () => {
      const next = readFiltersFromLocation();
      setDraftFrom(next.from);
      setDraftTo(next.to);
      setFilters(next);
    };
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  useEffect(() => {
    if (!filters.articleId || news.loading) return;
    document.getElementById(`news-${filters.articleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filters.articleId, news.items, news.loading]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    draftFrom ? params.set('from', draftFrom) : params.delete('from');
    draftTo ? params.set('to', draftTo) : params.delete('to');
    params.delete('articleId');
    const query = params.toString();
    window.history.replaceState({}, document.title, `/news${query ? `?${query}` : ''}`);
    setFilters({ from: draftFrom, to: draftTo, articleId: '', caseId: '' });
  };

  const resetFilters = () => {
    setDraftFrom('');
    setDraftTo('');
    window.history.replaceState({}, document.title, '/news');
    setFilters({ from: '', to: '', articleId: '', caseId: '' });
  };

  const leaveCaseSearch = () => {
    setDraftFrom('');
    setDraftTo('');
    window.history.replaceState({}, document.title, '/news');
    setFilters({ from: '', to: '', articleId: '', caseId: '' });
  };

  return (
    <div className="space-y-5">
      {filters.caseId && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5" aria-labelledby="case-news-context-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <Info className="mt-0.5 flex-none text-[#1e3a5f]" size={19} aria-hidden="true" />
              <div>
                <h2 id="case-news-context-title" className="font-black text-slate-950">
                  {news.caseContext?.name || '선택한 실종자'}님의 공식 단서로 검색 중
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  이름·지역·인상착의를 조합한 {news.queries.length || 1}개의 NAVER 원본 검색결과입니다. 해당 기사와 실종자가 동일 인물인지 자동 판정하거나 연결 정보를 저장하지 않습니다.
                </p>
                {caseCriteria.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700" aria-label="뉴스 검색에 사용한 공식 단서">
                    {caseCriteria.map((criterion) => (
                      <li key={criterion.label} className="max-w-full rounded-md border border-blue-200 bg-white px-2.5 py-1.5 break-words">
                        <strong className="mr-1 text-[#1e3a5f]">{criterion.label}</strong>{criterion.value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button type="button" onClick={leaveCaseSearch} className="inline-flex w-fit flex-none items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-[#1e3a5f] hover:bg-blue-100">
              <ArrowLeft size={14} /> 전체 뉴스
            </button>
          </div>
        </section>
      )}

      {!filters.caseId && <form onSubmit={applyFilters} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="뉴스 기간 필터">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Filter size={17} /> 기간 필터</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-bold text-slate-600">시작일
            <input type="date" value={draftFrom} max={draftTo || undefined} onChange={(event) => setDraftFrom(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="text-xs font-bold text-slate-600">종료일
            <input type="date" value={draftTo} min={draftFrom || undefined} onChange={(event) => setDraftTo(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[#10213a] px-4 py-2 text-sm font-black text-white hover:bg-[#1e3a5f]">적용</button>
            <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">초기화</button>
          </div>
        </div>
      </form>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="news-results-title" data-naver-search-results>
        <div className="mb-6 border-b border-slate-100 pb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#008f3e]">NAVER SEARCH RESULTS</p>
          <h2 id="news-results-title" className="mt-2 text-xl font-black text-slate-950">
            {filters.caseId ? '실종자 이름·지역·인상착의 NAVER 뉴스 검색 결과' : 'NAVER 뉴스 검색 결과'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">검색 결과는 원본 순서와 내용을 유지하며, 제목을 누르면 원문으로 이동합니다.</p>
        </div>
        <NewsList
          items={news.items}
          loading={news.loading}
          error={news.error}
          highlightedArticleId={filters.articleId}
          onRetry={news.reload}
        />
        {news.nextCursor && !news.loading && !news.error && (
          <div className="mt-6 border-t border-slate-100 pt-5 text-center">
            <button type="button" onClick={news.loadMore} disabled={news.loadingMore} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
              {news.loadingMore && <RefreshCw className="animate-spin" size={15} />}
              {news.loadingMore ? '불러오는 중...' : '뉴스 더 보기'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
