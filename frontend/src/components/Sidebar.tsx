import React, { useMemo } from 'react';
import { Filter, User, Clock, MapPin, X, MessageCircle, Search, Eye } from 'lucide-react';
import { useEmergencyStore } from '../stores/emergencyStore';
import type { MissingPersonStatus } from '../types';
import { formatViewCount } from '../hooks/useViewCount';

interface Props {
  onShowFilters: () => void;
  showFilters: boolean;
  onClose?: () => void;
}

const getTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    missing_child: '실종 아동',
    runaway: '가출인',
    disabled: '지적장애인',
    dementia: '치매환자',
    facility: '시설보호자',
    unknown: '신원불상',
  };
  return labels[type] || '기타';
};

const getTypeColor = (type: string): string => {
  const colors: Record<string, string> = {
    missing_child: 'bg-red-500',
    runaway: 'bg-blue-500',
    disabled: 'bg-orange-500',
    dementia: 'bg-purple-500',
    facility: 'bg-green-600',
    unknown: 'bg-gray-500',
  };
  return colors[type] || 'bg-gray-500';
};

const getTimeSince = (date: string): string => {
  const missingDate = new Date(date);

  if (isNaN(missingDate.getTime())) {
    return date;
  }

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - missingDate.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const formattedDate = missingDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (diffDays > 0) {
    return `${formattedDate} (${diffDays}일 경과)`;
  } else if (diffHours > 0) {
    return `${formattedDate} (${diffHours}시간 경과)`;
  }
  return formattedDate;
};

const getStatusLabel = (status?: MissingPersonStatus | null): string => {
  switch (status) {
    case 'active':
      return '수색중';
    case 'investigating':
      return '조사중';
    case 'found':
      return '발견 완료';
    default:
      return '상태 미상';
  }
};

const getStatusStyle = (status?: MissingPersonStatus | null): string => {
  switch (status) {
    case 'active':
      return 'bg-red-100 text-red-700';
    case 'investigating':
      return 'bg-yellow-100 text-yellow-700';
    case 'found':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export default function Sidebar({ onShowFilters, showFilters, onClose }: Props) {
  const missingPersons = useEmergencyStore(state => state.missingPersons);
  const filters = useEmergencyStore(state => state.filters);
  const sortOrder = useEmergencyStore(state => state.sortOrder);
  const selectedPersonId = useEmergencyStore(state => state.selectedPersonId);
  const hoveredPersonId = useEmergencyStore(state => state.hoveredPersonId);
  const setSelectedPersonId = useEmergencyStore(state => state.setSelectedPersonId);
  const setHoveredPersonId = useEmergencyStore(state => state.setHoveredPersonId);
  const getFilteredPersons = useEmergencyStore(state => state.getFilteredPersons);

  // useMemo로 필터링 결과 캐싱
  const filteredPersons = useMemo(() => {
    return getFilteredPersons();
  }, [missingPersons, filters, sortOrder, getFilteredPersons]);

  return (
    <div className="w-full h-full md:w-80 bg-white md:border-r border-gray-200 flex flex-col shadow-lg">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">실종자 목록</h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
              {filteredPersons.length}명
            </span>
            {/* 모바일 닫기 버튼 */}
            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={onShowFilters}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            showFilters
              ? 'bg-red-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Filter size={18} />
          <span className="font-medium">필터</span>
        </button>
      </div>

      {/* 실종자 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {filteredPersons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <User size={48} className="mb-2" />
            <p>실종자 정보가 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPersons.map((person) => {
              const primaryPhoto = person.photos && person.photos.length > 0 ? person.photos[0] : person.photo;
              const hasPhoto = Boolean(primaryPhoto);
              const isSelected = selectedPersonId === person.id;
              const isHovered = hoveredPersonId === person.id;
              const isHighlighted = isSelected || isHovered;
              const totalComments =
                typeof person.commentCount === 'number'
                  ? person.commentCount
                  : typeof person.commentStats?.total === 'number'
                  ? person.commentStats.total
                  : 0;
              const statusLabel = getStatusLabel(person.status);
              const statusClasses = getStatusStyle(person.status);

              return (
                <div
                  key={person.id}
                  className={`p-4 cursor-pointer transition-all ${
                    isHighlighted
                      ? 'bg-red-50 border-l-4 border-red-500 shadow-md'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedPersonId(person.id);
                    if (onClose) onClose(); // 모바일에서는 선택 후 사이드바 닫기
                  }}
                  onMouseEnter={() => setHoveredPersonId(person.id)}
                  onMouseLeave={() => setHoveredPersonId(null)}
                >
                <div className="flex gap-3">
                  {/* 사진 */}
                  <div className="flex-shrink-0">
                    {hasPhoto && (
                      <img
                        src={primaryPhoto as string}
                        alt={person.name}
                        className="w-16 h-16 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.nextElementSibling) {
                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    )}
                    <div
                      className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center"
                      style={{ display: hasPhoto ? 'none' : 'flex' }}
                    >
                      <User size={32} className="text-gray-400" />
                    </div>
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 truncate">
                        {person.name}
                      </h3>
                      <span className={`flex-shrink-0 px-2 py-0.5 ${getTypeColor(person.type)} text-white text-xs rounded-full`}>
                        {getTypeLabel(person.type)}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <User size={14} />
                        <span>
                          {person.age}세 · {person.gender === 'M' ? '남성' : person.gender === 'F' ? '여성' : '미상'}
                          {person.height && ` · ${person.height}cm`}
                          {person.weight && ` · ${person.weight}kg`}
                        </span>
                      </div>

                      {person.clothes && (
                        <div className="flex items-start gap-1">
                          <span className="text-xs">👕</span>
                          <span className="truncate text-xs">{person.clothes}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <MapPin size={14} />
                        <span className="truncate">{person.location.address}</span>
                      </div>

                      <div className="flex items-center gap-1 text-red-600">
                        <Clock size={14} />
                        <span>{getTimeSince(person.missingDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${statusClasses}`}>
                    <Search size={14} />
                    <span>{statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-blue-600">
                    <Eye size={14} />
                    <span>{formatViewCount(person.viewCount || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-gray-600">
                    <MessageCircle size={14} />
                    <span>{totalComments.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
