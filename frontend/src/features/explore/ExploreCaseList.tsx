import React, { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, MapPin, Search, UserCircle } from 'lucide-react';
import type { MissingPerson } from '../../types';
import type { ExploreViewMode } from './use-explore-state';
import CaseImpressionTracker from '../../components/analytics/CaseImpressionTracker';

interface ExploreCaseListProps {
  persons: MissingPerson[];
  view: ExploreViewMode;
  selectedPersonId: string | null;
  onSelect: (personId: string) => void;
}

const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(parsed)) : '날짜 미상';
};

const CasePhoto = ({ person }: { person: MissingPerson }) => {
  const [failed, setFailed] = useState(false);
  const source = person.photos?.[0] || person.photo;
  return source && !failed
    ? <img src={source} alt={`${person.name} 사진`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
    : <UserCircle className="text-slate-300" size={32} aria-hidden="true" />;
};

export default function ExploreCaseList({ persons, view, selectedPersonId, onSelect }: ExploreCaseListProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('ko-KR'));
  const visiblePersons = useMemo(() => persons.filter((person) => {
    if (!deferredQuery) return true;
    return [person.name, person.location.address, person.clothes, person.description]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase('ko-KR').includes(deferredQuery));
  }).slice(0, 500), [deferredQuery, persons]);
  const cards = view === 'cards';

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50" aria-label="실종자 탐색 결과">
      <div className="border-b border-slate-200 bg-white p-3">
        <label className="relative block">
          <span className="sr-only">현재 결과에서 검색</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·지역·인상착의" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" />
        </label>
        <p className="mt-2 text-xs font-bold text-slate-500">공식 공개 수색정보 {visiblePersons.length.toLocaleString()}건</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [content-visibility:auto]">
        <div className={cards ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
          {visiblePersons.map((person) => {
            const selected = selectedPersonId === person.id;
            return (
              <CaseImpressionTracker
                key={person.id}
                caseKey={person.id}
                caseCategory={person.type}
                address={person.location.address}
                surface="map"
                sourceAgency={person.source === 'api' ? 'police' : 'other_public'}
                enabled={person.status === 'active'}
              >
                {(impressionRef) => (
                  <button ref={impressionRef} type="button" onClick={() => onSelect(person.id)} aria-pressed={selected} className={`group flex w-full gap-3 rounded-xl border bg-white p-3 text-left transition hover:border-[#1e3a5f] hover:shadow-sm ${selected ? 'border-[#1e3a5f] ring-2 ring-blue-100' : 'border-slate-200'}`}>
                    <span className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-lg bg-slate-100"><CasePhoto person={person} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-950">{person.name}</strong><span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-700">수색 중</span></span>
                      <span className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={12} className="flex-none" aria-hidden="true" />{person.location.address || '지역 미상'}</span>
                      <span className="mt-1 block text-xs text-slate-400">{formatDate(person.missingDate)}</span>
                    </span>
                    <ArrowRight className="mt-5 flex-none text-slate-300 group-hover:text-[#1e3a5f]" size={16} aria-hidden="true" />
                  </button>
                )}
              </CaseImpressionTracker>
            );
          })}
        </div>
        {visiblePersons.length === 0 && <p className="py-16 text-center text-sm text-slate-400">조건에 맞는 정보가 없습니다.</p>}
      </div>
    </section>
  );
}
