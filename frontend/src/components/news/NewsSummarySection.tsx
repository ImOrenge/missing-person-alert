import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { NaverNewsItem } from '../../types/news';
import NewsList from './NewsList';

interface NewsSummarySectionProps {
  items: NaverNewsItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenAll: () => void;
  onOpenArticle: (articleId: string) => void;
}

export default function NewsSummarySection({ items, loading, error, onRetry, onOpenAll, onOpenArticle }: NewsSummarySectionProps) {
  return (
    <section className="border-b border-slate-200 py-8 lg:py-10" aria-labelledby="dashboard-news-title" data-naver-search-results>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#008f3e]">NAVER SEARCH RESULTS</p>
          <h2 id="dashboard-news-title" className="mt-2 text-xl font-black text-slate-950">실종자 관련 최신 뉴스</h2>
          <p className="mt-1 text-sm text-slate-500">NAVER에서 “실종”으로 검색한 최신 결과입니다.</p>
        </div>
        <button type="button" onClick={onOpenAll} className="inline-flex w-fit items-center gap-1 text-sm font-black text-[#1e3a5f] hover:underline">
          전체 뉴스 보기 <ArrowRight size={15} />
        </button>
      </div>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <NewsList
          items={items.slice(0, 5)}
          variant="compact"
          loading={loading}
          error={error}
          onRetry={onRetry}
          onSelectItem={onOpenArticle}
        />
      </div>
    </section>
  );
}
