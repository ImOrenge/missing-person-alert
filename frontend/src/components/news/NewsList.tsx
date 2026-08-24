import React from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import type { NaverNewsItem } from '../../types/news';
import NaverSearchText from './NaverSearchText';

interface NewsListProps {
  items: NaverNewsItem[];
  variant?: 'compact' | 'full';
  loading?: boolean;
  error?: string | null;
  highlightedArticleId?: string | null;
  onRetry?: () => void;
  onSelectItem?: (articleId: string) => void;
}

const formatPublishedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '발행일 미상';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

function NewsSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="animate-pulse border-b border-slate-100 py-4 last:border-0" aria-hidden="true">
      <div className="h-3 w-28 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-4/5 rounded bg-slate-200" />
      {!compact && <div className="mt-3 h-3 w-full rounded bg-slate-100" />}
    </div>
  );
}

export default function NewsList({
  items,
  variant = 'full',
  loading = false,
  error,
  highlightedArticleId,
  onRetry,
  onSelectItem,
}: NewsListProps) {
  const compact = variant === 'compact';

  if (loading) {
    return <div aria-label="뉴스 불러오는 중">{Array.from({ length: compact ? 3 : 5 }, (_, index) => <NewsSkeleton key={index} compact={compact} />)}</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-8 text-center" role="alert">
        <p className="text-sm font-bold text-red-700">{error}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 hover:bg-red-100">
            <RefreshCw size={14} /> 다시 시도
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center text-slate-500">
        <Newspaper className="mx-auto text-slate-300" size={32} />
        <p className="mt-3 text-sm font-bold">표시할 뉴스 검색 결과가 없습니다.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100" aria-label="NAVER 뉴스 검색 결과">
      {items.map((item) => {
        const sourceUrl = item.originallink || item.link;
        const highlighted = highlightedArticleId === item.id;
        return (
          <li
            id={`news-${item.id}`}
            key={item.id}
            className={`scroll-mt-24 py-4 first:pt-0 last:pb-0 ${highlighted ? 'rounded-xl bg-emerald-50 px-4 ring-2 ring-emerald-200' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
              <span className="rounded bg-[#03c75a]/10 px-2 py-1 text-[#008f3e]">NAVER 검색</span>
              <time dateTime={item.pubDate}>{formatPublishedAt(item.pubDate)}</time>
            </div>
            <h3 className={`${compact ? 'mt-2 text-sm' : 'mt-3 text-base sm:text-lg'} font-black leading-6 text-slate-950`}>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#008f3e] hover:underline">
                <NaverSearchText value={item.title} />
                <ExternalLink className="ml-1 inline" size={13} aria-hidden="true" />
                <span className="sr-only"> (새 창에서 원문 열기)</span>
              </a>
            </h3>
            {!compact && item.description && (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600"><NaverSearchText value={item.description} /></p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold">
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#008f3e] hover:underline">기사 원문</a>
              {compact && onSelectItem && (
                <button type="button" onClick={() => onSelectItem(item.id)} className="text-[#1e3a5f] hover:underline">뉴스 목록에서 보기</button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
