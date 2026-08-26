import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, MapPin, X, Eye, Search, RefreshCw } from 'lucide-react';
import type { MissingPerson } from '../types';
import { useEmergencyStore } from '../stores/emergencyStore';
import CaseImpressionTracker from './analytics/CaseImpressionTracker';

interface DesktopGridViewProps {
  persons: MissingPerson[];
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: '수색중', className: 'bg-red-100 text-red-700' },
  investigating: { label: '조사중', className: 'bg-yellow-100 text-yellow-700' },
  found: { label: '발견 완료', className: 'bg-green-100 text-green-700' }
};

const STATUS_OPTIONS: Array<{ id: MissingPerson['status']; label: string }> = [
  { id: 'active', label: STATUS_STYLES.active.label },
  { id: 'investigating', label: STATUS_STYLES.investigating.label },
  { id: 'found', label: STATUS_STYLES.found.label }
];

const formatDateLabel = (value?: string): string => {
  if (!value) {
    return '날짜 정보 없음';
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatRelativeLabel = (value?: string | number): string => {
  if (value === undefined || value === null) {
    return '기록 없음';
  }

  let timestamp: number | null = null;

  if (typeof value === 'number') {
    timestamp = Number.isFinite(value) ? value : null;
  } else {
    const parsed = new Date(value).getTime();
    timestamp = Number.isFinite(parsed) ? parsed : null;
  }

  if (!Number.isFinite(timestamp) || timestamp === null) {
    return '기록 없음';
  }

  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return typeof value === 'number' ? formatDateLabel(new Date(value).toISOString()) : formatDateLabel(value);
};

const getGenderLabel = (gender?: string): string => {
  switch ((gender || '').toUpperCase()) {
    case 'M':
      return '남성';
    case 'F':
      return '여성';
    default:
      return '성별 미상';
  }
};

export const DesktopGridView: React.FC<DesktopGridViewProps> = ({ persons, isOpen, onClose }) => {
  const setSelectedPersonId = useEmergencyStore((state) => state.setSelectedPersonId);
  const selectedPersonId = useEmergencyStore((state) => state.selectedPersonId);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<MissingPerson['status'][]>([]);
  const [sortMode, setSortMode] = useState<'recent' | 'age_desc' | 'age_asc'>('recent');

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  const baseList = useMemo(() => {
    return persons
      .map((person) => {
        const updatedAt = typeof person.updatedAt === 'number' && Number.isFinite(person.updatedAt)
          ? person.updatedAt
          : null;
        const missingTime = new Date(person.missingDate).getTime();
        const fallback = Number.isFinite(missingTime) ? missingTime : 0;
        return {
          record: person,
          sortKey: updatedAt ?? fallback,
          relativeSource: updatedAt ?? fallback,
          searchable: [
            person.name,
            person.location?.address,
            person.description,
            person.reportedBy?.name
          ]
            .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => (entry as string).toLowerCase())
        };
      })
      .sort((a, b) => b.sortKey - a.sortKey)
      .map((entry) => ({
        person: entry.record,
        relativeTimestamp: entry.relativeSource,
        searchable: entry.searchable
      }));
  }, [persons]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const activeStatuses = statusFilters;

    let items = baseList;

    if (normalizedQuery.length > 0) {
      items = items.filter((item) => {
        if (item.person.name?.toLowerCase().includes(normalizedQuery)) {
          return true;
        }
        return item.searchable.some((entry) => entry.includes(normalizedQuery));
      });
    }

    if (activeStatuses.length > 0) {
      items = items.filter((item) => activeStatuses.includes(item.person.status));
    }

    let sorted = items;
    if (sortMode === 'age_desc') {
      sorted = [...items].sort((a, b) => {
        const ageA = Number.isFinite(a.person.age) ? a.person.age : -Infinity;
        const ageB = Number.isFinite(b.person.age) ? b.person.age : -Infinity;
        return ageB - ageA;
      });
    } else if (sortMode === 'age_asc') {
      sorted = [...items].sort((a, b) => {
        const ageA = Number.isFinite(a.person.age) ? a.person.age : Infinity;
        const ageB = Number.isFinite(b.person.age) ? b.person.age : Infinity;
        return ageA - ageB;
      });
    }

    return sorted.map((item) => ({
      person: item.person,
      relativeTimestamp: item.relativeTimestamp
    }));
  }, [baseList, searchQuery, statusFilters, sortMode]);

  const totalCount = persons.length;
  const visibleCount = filteredCards.length;
  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilters.length > 0 || sortMode !== 'recent';

  if (!isOpen) {
    return null;
  }

  const handleCardClick = (personId: string) => {
    setSelectedPersonId(personId);
  };

  return (
    <div
      className="fixed inset-0 z-[95] hidden md:flex items-center justify-center bg-slate-900/70 px-8 py-10 backdrop-blur"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-[min(1200px,90vw)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-8 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold text-slate-900">실종자 목록 (데스크톱)</h2>
              <p className="text-sm text-slate-500">
                바둑판 형태로 최근 실종자 정보를 빠르게 확인하고 선택할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-600">
                총 {totalCount.toLocaleString()}명 · 표시 {visibleCount.toLocaleString()}명
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                aria-label="격자 보기 닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-red-200">
              <Search className="h-4 w-4 text-slate-400" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="이름, 위치, 설명으로 검색"
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                aria-label="실종자 검색"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-red-200"
                aria-label="정렬 방식 선택"
              >
                <option value="recent">최신순</option>
                <option value="age_desc">나이 많은 순</option>
                <option value="age_asc">나이 어린 순</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilters([]);
                  setSortMode('recent');
                }}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                초기화
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => {
              const isActive = statusFilters.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setStatusFilters((prev) =>
                      isActive ? prev.filter((item) => item !== option.id) : [...prev, option.id]
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 ${
                    isActive
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <p className="mt-2 text-xs text-slate-400">
              필터가 적용되어 있습니다. 초기화를 눌러 전체 목록을 다시 확인하세요.
            </p>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">
          {filteredCards.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-500">
              <Eye className="h-10 w-10 text-slate-300" />
              <p>
                {totalCount === 0
                  ? '표시할 실종자 정보가 없습니다.'
                  : '조건에 맞는 실종자 정보가 없습니다. 필터를 조정해 보세요.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {filteredCards.map(({ person, relativeTimestamp }) => {
                const status = STATUS_STYLES[person.status] ?? STATUS_STYLES.active;
                const isSelected = selectedPersonId === person.id;
                const primaryPhoto = person.photos?.[0] ?? person.photo ?? null;
                const locationLabel = person.location?.address ?? '위치 정보 없음';
                const relativeValue = Number.isFinite(relativeTimestamp) && relativeTimestamp > 0
                  ? relativeTimestamp
                  : person.updatedAt ?? person.missingDate;

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
                  {(impressionRef) => <button
                      ref={impressionRef}
                      type="button"
                      onClick={() => handleCardClick(person.id)}
                      className={`group flex h-full flex-col rounded-2xl border px-4 py-5 text-left shadow-sm transition ${
                        isSelected
                          ? 'border-red-300 bg-red-50/60 shadow'
                          : 'border-slate-200 bg-white hover:-translate-y-1 hover:border-red-200 hover:shadow-md'
                      }`}
                      aria-pressed={isSelected}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{person.name}</h3>
                        <p className="text-sm text-slate-500">
                          {person.age ? `${person.age}세 · ` : ''}
                          {getGenderLabel(person.gender)}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </div>

                    {primaryPhoto ? (
                      <div className="mt-4 overflow-hidden rounded-xl">
                        <div className="aspect-square w-full">
                          <img
                            src={primaryPhoto}
                            alt={`${person.name} 사진`}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex aspect-square items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">
                        사진 정보 없음
                      </div>
                    )}

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-red-500" />
                        <span className="truncate" title={locationLabel}>
                          {locationLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span>{formatDateLabel(person.missingDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>마지막 업데이트 {formatRelativeLabel(relativeValue)}</span>
                      </div>
                    </div>
                    </button>}
                  </CaseImpressionTracker>
                );
              })}
            </div>
          )}
        </main>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-8 py-4 text-xs text-slate-500">
          <span>카드를 클릭하면 해당 실종자를 지도에서 강조 표시합니다.</span>
          <span className="hidden xl:inline">
            필터는 기존 사이드바와 동일하게 적용되어 표시됩니다.
          </span>
        </footer>
      </div>
    </div>
  );
};
