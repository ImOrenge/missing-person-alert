import React from 'react';
import { X, ArrowUpDown } from 'lucide-react';
import { useEmergencyStore } from '../stores/emergencyStore';

const KOREAN_REGIONS = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원도',
  '충청북도',
  '충청남도',
  '전라북도',
  '전라남도',
  '경상북도',
  '경상남도',
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

  const handleTypeToggle = (type: string) => {
    const newTypes = filters.types.includes(type as any)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type as any];
    updateFilters({ types: newTypes });
  };

  return (
    <div className="bg-white p-6 shadow-lg border-b-2 border-gray-200">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">🔍 필터</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* 통계 정보 */}
        <div style={{ minWidth: '150px' }}>
          <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#2c3e50' }}>
            📊 현황
          </h3>
          <div
            style={{
              padding: '15px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}
          >
            <p style={{ margin: '5px 0', fontSize: '14px' }}>
              <strong>전체:</strong> {missingPersons.length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#e74c3c' }}>
              <strong>아동:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'missing_child').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#3498db' }}>
              <strong>일반:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'general').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#16a085' }}>
              <strong>가출:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'runaway').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#f39c12' }}>
              <strong>장애인:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'disabled').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#9b59b6' }}>
              <strong>치매:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'dementia').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#27ae60' }}>
              <strong>시설:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'facility').length}명
            </p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#7f8c8d' }}>
              <strong>불상:</strong>{' '}
              {missingPersons.filter((p) => p.type === 'unknown').length}명
            </p>
          </div>
        </div>

        {/* 지역 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#2c3e50' }}>
            🗺️ 지역 선택
          </h3>
          <select
            multiple
            value={filters.regions}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
              updateFilters({ regions: selected });
            }}
            style={{
              width: '200px',
              height: '150px',
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '13px',
              backgroundColor: 'white'
            }}
          >
            {KOREAN_REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <button
            onClick={() => updateFilters({ regions: [] })}
            style={{
              marginTop: '8px',
              width: '100%',
              padding: '8px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            전체 지역
          </button>
          {filters.regions.length > 0 && (
            <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
              {filters.regions.length}개 지역 선택됨
            </p>
          )}
        </div>

        {/* 유형 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#2c3e50' }}>
            👥 실종자 유형
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '8px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}
          >
            {[
              { value: 'missing_child', label: '🔴 실종 아동', color: '#e74c3c' },
              { value: 'general', label: '🔵 일반 실종자', color: '#3498db' },
              { value: 'runaway', label: '🟢 가출인', color: '#16a085' },
              { value: 'disabled', label: '🟠 지적장애인', color: '#f39c12' },
              { value: 'dementia', label: '🟣 치매환자', color: '#9b59b6' },
              { value: 'facility', label: '🟢 시설보호자', color: '#27ae60' },
              { value: 'unknown', label: '⚫ 신원불상', color: '#7f8c8d' }
            ].map(({ value, label, color }) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <input
                  type="checkbox"
                  checked={filters.types.includes(value as any)}
                  onChange={() => handleTypeToggle(value)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontWeight: filters.types.includes(value as any) ? 'bold' : 'normal' }}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 시간 범위 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#2c3e50' }}>
            ⏰ 기간 선택
          </h3>
          <select
            value={filters.timeRange}
            onChange={(e) => updateFilters({ timeRange: e.target.value as any })}
            style={{
              width: '180px',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '14px',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
            <option value="60d">최근 60일</option>
            <option value="90d">최근 90일</option>
            <option value="1y">최근 1년</option>
            <option value="all">전체</option>
          </select>
        </div>

        {/* 정렬 순서 */}
        <div>
          <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#2c3e50' }}>
            📅 날짜 정렬
          </h3>
          <button
            onClick={toggleSortOrder}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '180px',
              padding: '10px 15px',
              borderRadius: '8px',
              border: '1px solid #ced4da',
              fontSize: '14px',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
              e.currentTarget.style.borderColor = '#007bff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.borderColor = '#ced4da';
            }}
          >
            <ArrowUpDown size={16} />
            {sortOrder === 'desc' ? '최신순 ▼' : '오래된순 ▲'}
          </button>
          <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
            {sortOrder === 'desc' ? '최근 실종자부터 표시' : '오래된 실종자부터 표시'}
          </p>
        </div>
      </div>
    </div>
  );
}
