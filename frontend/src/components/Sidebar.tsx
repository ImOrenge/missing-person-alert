import React from 'react';
import { Filter, User, Clock, MapPin } from 'lucide-react';
import { useEmergencyStore } from '../stores/emergencyStore';

interface Props {
  onShowFilters: () => void;
  showFilters: boolean;
}

const getTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    missing_child: '실종 아동',
    disabled: '지적장애인',
    dementia: '치매환자',
  };
  return labels[type] || '기타';
};

const getTypeColor = (type: string): string => {
  const colors: Record<string, string> = {
    missing_child: 'bg-red-500',
    disabled: 'bg-orange-500',
    dementia: 'bg-purple-500',
  };
  return colors[type] || 'bg-gray-500';
};

const getTimeSince = (date: string): string => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}시간 ${minutes}분 전`;
  return `${minutes}분 전`;
};

export default function Sidebar({ onShowFilters, showFilters }: Props) {
  const getFilteredPersons = useEmergencyStore(state => state.getFilteredPersons);
  const selectedPersonId = useEmergencyStore(state => state.selectedPersonId);
  const hoveredPersonId = useEmergencyStore(state => state.hoveredPersonId);
  const setSelectedPersonId = useEmergencyStore(state => state.setSelectedPersonId);
  const setHoveredPersonId = useEmergencyStore(state => state.setHoveredPersonId);
  const filteredPersons = getFilteredPersons();

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">실종자 목록</h2>
          <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
            {filteredPersons.length}명
          </span>
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
              const isSelected = selectedPersonId === person.id;
              const isHovered = hoveredPersonId === person.id;
              const isHighlighted = isSelected || isHovered;

              return (
                <div
                  key={person.id}
                  className={`p-4 cursor-pointer transition-all ${
                    isHighlighted
                      ? 'bg-red-50 border-l-4 border-red-500 shadow-md'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedPersonId(person.id)}
                  onMouseEnter={() => setHoveredPersonId(person.id)}
                  onMouseLeave={() => setHoveredPersonId(null)}
                >
                <div className="flex gap-3">
                  {/* 사진 */}
                  <div className="flex-shrink-0">
                    {person.photo ? (
                      <img
                        src={person.photo}
                        alt={person.name}
                        className="w-16 h-16 rounded-lg object-cover"
                        onError={(e) => {
                          // 이미지 로드 실패 시 기본 아이콘으로 대체
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.nextElementSibling) {
                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center"
                      style={{ display: person.photo ? 'none' : 'flex' }}
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
                        <span>{person.age}세 · {person.gender === 'M' ? '남성' : '여성'}</span>
                      </div>

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
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
