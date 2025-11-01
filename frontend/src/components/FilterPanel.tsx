import React from 'react';
import { X, ArrowUpDown } from 'lucide-react';
import { useEmergencyStore } from '../stores/emergencyStore';
import type { MissingPersonType, TimeRange } from '../types';

const KOREAN_REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도',
  '제주특별자치도'
];

interface Props {
  onClose: () => void;
}

export default function FilterPanel({ onClose }: Props) {
  const { filters, updateFilters, missingPersons, sortOrder, toggleSortOrder } = useEmergencyStore();

  const handleRegionToggle = (region: string) => {
    const newRegions = filters.regions.includes(region)
      ? filters.regions.filter((r) => r !== region)
      : [...filters.regions, region];
    updateFilters({ regions: newRegions });
  };

  const handleTypeToggle = (type: MissingPersonType) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    updateFilters({ types: newTypes });
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    updateFilters({ timeRange: range });
  };

  return (
    <div className="bg-white w-full h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex-shrink-0 bg-white border-b p-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          🔍 필터
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 통계 정보 */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            📊 실종자 현황
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-800">{missingPersons.length}</p>
              <p className="text-xs text-gray-600 mt-1">전체</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-600">
                {missingPersons.filter((p) => p.type === 'missing_child').length}
              </p>
              <p className="text-xs text-gray-600 mt-1">아동</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">
                {missingPersons.filter((p) => p.type === 'disabled').length}
              </p>
              <p className="text-xs text-gray-600 mt-1">장애인</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {missingPersons.filter((p) => p.type === 'dementia').length}
              </p>
              <p className="text-xs text-gray-600 mt-1">치매</p>
            </div>
          </div>
        </div>

        {/* 정렬 */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">🔄 정렬</h3>
          <button
            onClick={toggleSortOrder}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowUpDown size={18} />
            <span className="font-medium">
              {sortOrder === 'desc' ? '최신순' : '오래된순'}
            </span>
          </button>
        </div>

        {/* 실종 기간 */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">📅 실종 기간</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {([
              { range: '30d' as TimeRange, label: '30일 이내' },
              { range: '90d' as TimeRange, label: '90일 이내' },
              { range: '180d' as TimeRange, label: '180일 이내' },
              { range: '1y' as TimeRange, label: '1년 이내' },
              { range: '3y' as TimeRange, label: '3년 이내' },
              { range: '5y' as TimeRange, label: '5년 이내' },
              { range: 'all' as TimeRange, label: '전체' },
            ]).map((item) => (
              <button
                key={item.range}
                onClick={() => handleTimeRangeChange(item.range)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  filters.timeRange === item.range
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 실종자 유형 */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-3">👥 실종자 유형</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {([
              { type: 'missing_child' as MissingPersonType, label: '실종 아동', color: 'bg-red-500' },
              { type: 'runaway' as MissingPersonType, label: '가출인', color: 'bg-blue-500' },
              { type: 'disabled' as MissingPersonType, label: '지적장애인', color: 'bg-orange-500' },
              { type: 'dementia' as MissingPersonType, label: '치매환자', color: 'bg-purple-500' },
              { type: 'facility' as MissingPersonType, label: '시설보호자', color: 'bg-green-600' },
              { type: 'unknown' as MissingPersonType, label: '신원불상', color: 'bg-gray-500' },
            ]).map((item) => (
              <button
                key={item.type}
                onClick={() => handleTypeToggle(item.type)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  filters.types.includes(item.type)
                    ? `${item.color} text-white shadow-lg`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 지역 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-700">📍 지역</h3>
            <button
              onClick={() => updateFilters({ regions: [] })}
              className="text-xs text-red-600 hover:text-red-700 font-medium"
            >
              전체 선택 해제
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {KOREAN_REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => handleRegionToggle(region)}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${
                  filters.regions.includes(region)
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {region.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')}
              </button>
            ))}
          </div>
        </div>

        {/* 필터 리셋 */}
        <div className="pt-4 border-t">
          <button
            onClick={() => {
              updateFilters({ types: [], regions: [], timeRange: '30d' });
              onClose();
            }}
            className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-semibold transition-colors"
          >
            모든 필터 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
