# 경찰청 API 기반 실시간 실종자 재난 알림 웹앱 개발 가이드

**경찰청 공공데이터 API는 WebSocket을 지원하지 않으며, REST API 폴링 방식만 가능합니다.** 실시간 알림을 위해서는 프론트엔드에서 주기적으로 API를 호출하거나, 백엔드 서버를 구축하여 폴링 후 WebSocket으로 클라이언트에 전달하는 2단계 아키텍처가 필요합니다.

## 핵심 발견사항

경찰청과 행정안전부는 **data.go.kr**(공공데이터포털)와 **safetydata.go.kr**(재난안전데이터 공유 플랫폼)을 통해 실종자 및 긴급재난문자 데이터를 제공하지만, 모든 API는 RESTful 방식이며 실시간 스트리밍이나 WebSocket 연결을 지원하지 않습니다. 2025년 기준 가장 효과적인 접근 방식은 백엔드에서 지능형 폴링을 구현하고, 프론트엔드에 WebSocket으로 전달하는 하이브리드 아키텍처입니다.

---

## 1. 사용 가능한 경찰청 API 현황

### 1.1 실종자 관련 API

#### **경찰청_실종경보정보 서비스** (우선 사용 권장)
- **URL**: https://www.data.go.kr/data/3051810/openapi.do
- **제공 데이터**: 실종경보(Amber Alert) 발령 대상자 정보
- **대상**: 만 18세 미만 아동(코드: 010), 지적장애인(코드: 060), 치매환자(코드: 070)
- **데이터 필드**: 
  - 실종자 구분/유형
  - 성별, 이름
  - 사진 URL
  - 신체 특징
  - 경보 상태

#### **경찰청_실종아동정보 서비스** (보조 데이터베이스)
- **URL**: https://www.data.go.kr/data/3052083/openapi.do
- **제공 데이터**: 전체 실종자 데이터베이스
- **법적 근거**: 실종아동등의 보호 및 지원에 관한 법률

### 1.2 긴급재난문자 API

#### **행정안전부_긴급재난문자** (NEW 플랫폼)
- **URL**: https://www.safetydata.go.kr/disaster-data/view?dataSn=228
- **중요**: 2023년부터 data.go.kr에서 safetydata.go.kr로 이관 중
- **데이터 필드**:
  - 생성일시 (조회시작일자로 변경됨)
  - 지역명, 지역코드
  - 발송시각
  - 재난내용
  - 재난유형
- **제약사항**: 2023년 이후 데이터만 제공

### 1.3 API 인증 및 제한사항

**등록 절차**:
1. data.go.kr 또는 safetydata.go.kr 회원가입
2. 원하는 API 서비스 페이지에서 "활용신청" 클릭
3. 신청서 작성 (사용 목적, 기능 설명 등)
4. 승인 대기:
   - **개발계정**: 자동승인 (즉시 사용 가능)
   - **운영계정**: 2-3일 수동 심사

**트래픽 제한**:
- **개발계정**: 일일 1,000건
- **운영계정**: 협의 가능 (사용 사례 등록 시 증량 가능)
- 초과 시 HTTP 429 오류 (Too Many Requests)

**비용**: ✅ **완전 무료** (모든 공공데이터 API)

**주요 제약**:
- ❌ WebSocket 미지원
- ❌ 실시간 푸시 알림 없음
- ❌ 무제한 요청 불가
- ✅ REST API 폴링만 가능

---

## 2. 추천 아키텍처: 3-Tier Polling + WebSocket 시스템

```
[경찰청 API] ←─ 폴링(10-60초) ─← [Node.js 백엔드] ─ WebSocket ─→ [React 프론트엔드]
    (REST)                           (Express + WS)              (@vis.gl/react-google-maps)
```

### 2.1 백엔드 서버 (Node.js + Express)

백엔드는 경찰청 API를 주기적으로 폴링하고, 새로운 데이터를 감지하면 연결된 클라이언트에게 WebSocket으로 전송합니다.

```javascript
// server.js
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const wss = new WebSocket.Server({ port: 8080 });

// 마지막 조회 시간 저장 (중복 방지)
let lastFetchTime = new Date();
const notifiedIds = new Set();

// 경찰청 API 폴링 함수
async function pollMissingPersonsAPI() {
  try {
    const response = await axios.get('http://apis.data.go.kr/1360000/MissingAlertService/getMissingAlertList', {
      params: {
        serviceKey: process.env.DATA_GO_KR_API_KEY,
        pageNo: 1,
        numOfRows: 100,
        resultType: 'JSON'
      }
    });

    const items = response.data.response?.body?.items?.item || [];
    const newItems = items.filter(item => {
      const itemDate = new Date(item.regDt);
      return itemDate > lastFetchTime && !notifiedIds.has(item.missingId);
    });

    if (newItems.length > 0) {
      // WebSocket으로 모든 연결된 클라이언트에 전송
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'NEW_MISSING_PERSON',
            data: newItems,
            timestamp: new Date().toISOString()
          }));
        }
      });

      // 알림 ID 저장 (중복 방지)
      newItems.forEach(item => notifiedIds.add(item.missingId));
      lastFetchTime = new Date();
    }

  } catch (error) {
    console.error('API 폴링 오류:', error.message);
  }
}

// 긴급재난문자 API 폴링
async function pollEmergencyMessagesAPI() {
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await axios.get('https://www.safetydata.go.kr/openapi/disaster-message', {
      params: {
        serviceKey: process.env.SAFETY_DATA_API_KEY,
        searchStartDate: today,
        numOfRows: 50,
        resultType: 'JSON'
      }
    });

    // 새 메시지 필터링 및 전송 로직
    // ... (실종자 API와 동일한 패턴)
  } catch (error) {
    console.error('재난문자 API 폴링 오류:', error.message);
  }
}

// 10초마다 실행 (높은 우선순위 데이터)
cron.schedule('*/10 * * * * *', pollMissingPersonsAPI);

// 30초마다 실행 (일반 재난문자)
cron.schedule('*/30 * * * * *', pollEmergencyMessagesAPI);

// WebSocket 연결 처리
wss.on('connection', (ws) => {
  console.log('새 클라이언트 연결됨');
  
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  });

  ws.on('close', () => {
    console.log('클라이언트 연결 종료');
  });
});

app.listen(3000, () => {
  console.log('서버가 3000번 포트에서 실행 중');
});
```

### 2.2 환경 변수 설정

```bash
# .env
DATA_GO_KR_API_KEY=your_data_go_kr_service_key
SAFETY_DATA_API_KEY=your_safetydata_go_kr_service_key
```

---

## 3. React 프론트엔드 구현

### 3.1 필수 패키지 설치

```bash
npm install @vis.gl/react-google-maps \
            @googlemaps/markerclusterer \
            react-use-websocket \
            zustand \
            react-toastify
```

### 3.2 Zustand 상태 관리 스토어

```typescript
// stores/emergencyStore.ts
import { create } from 'zustand';

interface MissingPerson {
  id: string;
  name: string;
  age: number;
  gender: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  photo?: string;
  description: string;
  missingDate: string;
  type: 'missing_child' | 'disabled' | 'dementia';
  status: 'active' | 'found' | 'investigating';
}

interface EmergencyStore {
  missingPersons: MissingPerson[];
  filters: {
    regions: string[];
    types: string[];
    timeRange: '24h' | '7d' | '30d' | 'all';
  };
  addMissingPerson: (person: MissingPerson) => void;
  updateFilters: (filters: Partial<EmergencyStore['filters']>) => void;
  getFilteredPersons: () => MissingPerson[];
}

export const useEmergencyStore = create<EmergencyStore>((set, get) => ({
  missingPersons: [],
  filters: {
    regions: [],
    types: ['missing_child', 'disabled', 'dementia'],
    timeRange: 'all'
  },
  
  addMissingPerson: (person) => {
    set((state) => ({
      missingPersons: [person, ...state.missingPersons]
    }));
  },
  
  updateFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters }
    }));
  },
  
  getFilteredPersons: () => {
    const { missingPersons, filters } = get();
    return missingPersons.filter(person => {
      // 지역 필터
      if (filters.regions.length > 0) {
        const personRegion = person.location.address.split(' ')[0];
        if (!filters.regions.includes(personRegion)) return false;
      }
      
      // 유형 필터
      if (!filters.types.includes(person.type)) return false;
      
      // 시간 필터
      if (filters.timeRange !== 'all') {
        const cutoffTime = Date.now() - parseTimeRange(filters.timeRange);
        const missingTime = new Date(person.missingDate).getTime();
        if (missingTime < cutoffTime) return false;
      }
      
      return true;
    });
  }
}));

function parseTimeRange(range: string): number {
  switch (range) {
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}
```

### 3.3 WebSocket 연결 훅

```typescript
// hooks/useEmergencyWebSocket.ts
import { useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { toast } from 'react-toastify';
import { useEmergencyStore } from '../stores/emergencyStore';

const WS_URL = 'ws://localhost:8080';

export function useEmergencyWebSocket() {
  const addMissingPerson = useEmergencyStore(state => state.addMissingPerson);
  
  const { lastJsonMessage, readyState, sendJsonMessage } = useWebSocket(
    WS_URL,
    {
      onOpen: () => {
        console.log('WebSocket 연결 성공');
        toast.success('실시간 알림 연결됨');
      },
      onClose: () => {
        console.log('WebSocket 연결 종료');
        toast.warning('실시간 알림 연결 끊김');
      },
      onError: (error) => {
        console.error('WebSocket 오류:', error);
        toast.error('연결 오류 발생');
      },
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: (attemptNumber) => 
        Math.min(Math.pow(2, attemptNumber) * 1000, 10000),
      heartbeat: {
        message: JSON.stringify({ type: 'ping' }),
        returnMessage: 'pong',
        timeout: 60000,
        interval: 25000,
      }
    }
  );

  useEffect(() => {
    if (lastJsonMessage && lastJsonMessage.type === 'NEW_MISSING_PERSON') {
      const newPersons = lastJsonMessage.data;
      
      newPersons.forEach((person: any) => {
        // 스토어에 추가
        addMissingPerson(transformAPIData(person));
        
        // 긴급 알림 표시
        toast.error(
          `🚨 새로운 실종자 정보: ${person.name} (${person.age}세)`,
          { 
            autoClose: false,
            position: 'top-center'
          }
        );
        
        // 브라우저 알림
        if (Notification.permission === 'granted') {
          new Notification('실종자 긴급 알림', {
            body: `${person.name} (${person.age}세)님이 실종되었습니다.`,
            icon: '/icons/emergency.png',
            requireInteraction: true
          });
        }
        
        // 알림음 재생
        new Audio('/sounds/emergency-alert.mp3').play().catch(e => 
          console.log('오디오 재생 실패:', e)
        );
      });
    }
  }, [lastJsonMessage, addMissingPerson]);

  return {
    isConnected: readyState === ReadyState.OPEN,
    connectionState: readyState,
    sendMessage: sendJsonMessage
  };
}

function transformAPIData(apiData: any): MissingPerson {
  // API 응답을 앱 데이터 구조로 변환
  return {
    id: apiData.missingId,
    name: apiData.name,
    age: apiData.age,
    gender: apiData.gender,
    location: {
      lat: parseFloat(apiData.latitude),
      lng: parseFloat(apiData.longitude),
      address: apiData.missingPlace
    },
    photo: apiData.photoUrl,
    description: apiData.description,
    missingDate: apiData.regDt,
    type: getTypeFromCode(apiData.typeCode),
    status: 'active'
  };
}

function getTypeFromCode(code: string): MissingPerson['type'] {
  switch (code) {
    case '010': return 'missing_child';
    case '060': return 'disabled';
    case '070': return 'dementia';
    default: return 'missing_child';
  }
}
```

### 3.4 Google Maps 메인 컴포넌트

```typescript
// components/EmergencyMap.tsx
import React, { useState, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef
} from '@vis.gl/react-google-maps';
import { useEmergencyStore } from '../stores/emergencyStore';
import { useEmergencyWebSocket } from '../hooks/useEmergencyWebSocket';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const KOREA_CENTER = { lat: 37.5665, lng: 126.9780 }; // 서울
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY!;
const MAP_ID = process.env.REACT_APP_MAP_ID!;

export default function EmergencyMap() {
  const getFilteredPersons = useEmergencyStore(state => state.getFilteredPersons);
  const { isConnected } = useEmergencyWebSocket();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredPersons = getFilteredPersons();

  return (
    <div className="emergency-map-container">
      <ConnectionStatus isConnected={isConnected} />
      <FilterPanel />
      
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <div style={{ height: 'calc(100vh - 120px)', width: '100%' }}>
          <Map
            defaultCenter={KOREA_CENTER}
            defaultZoom={7}
            mapId={MAP_ID}
            gestureHandling="greedy"
            disableDefaultUI={false}
            zoomControl={true}
          >
            {filteredPersons.map((person) => (
              <MarkerWithInfo
                key={person.id}
                person={person}
                isSelected={selectedId === person.id}
                onClick={() => setSelectedId(person.id)}
                onClose={() => setSelectedId(null)}
              />
            ))}
          </Map>
        </div>
      </APIProvider>

      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

// 마커 + 인포윈도우 컴포넌트
const MarkerWithInfo = React.memo(({ person, isSelected, onClick, onClose }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={person.location}
        onClick={onClick}
        title={person.name}
      >
        <Pin
          background={getColorByType(person.type)}
          glyphColor="#fff"
          borderColor="#000"
          scale={1.2}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose}>
          <div className="info-window-content" style={{ minWidth: '250px' }}>
            {person.photo && (
              <img 
                src={person.photo} 
                alt={person.name}
                style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }}
              />
            )}
            <h3 style={{ margin: '10px 0' }}>{person.name}</h3>
            <p><strong>나이:</strong> {person.age}세</p>
            <p><strong>성별:</strong> {person.gender === 'M' ? '남성' : '여성'}</p>
            <p><strong>실종 장소:</strong> {person.location.address}</p>
            <p><strong>실종 일시:</strong> {new Date(person.missingDate).toLocaleString('ko-KR')}</p>
            <p><strong>유형:</strong> {getTypeLabel(person.type)}</p>
            <p><strong>특징:</strong> {person.description}</p>
            
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => window.open(`tel:112`)}
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  backgroundColor: '#e74c3c', 
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                112 신고
              </button>
              <button 
                onClick={() => shareInfo(person)}
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  backgroundColor: '#3498db', 
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                공유하기
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
});

function getColorByType(type: string): string {
  switch (type) {
    case 'missing_child': return '#e74c3c'; // 빨강 (아동)
    case 'disabled': return '#f39c12';      // 주황 (장애인)
    case 'dementia': return '#9b59b6';      // 보라 (치매)
    default: return '#95a5a6';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'missing_child': return '실종 아동';
    case 'disabled': return '지적장애인';
    case 'dementia': return '치매환자';
    default: return '기타';
  }
}

function shareInfo(person: MissingPerson) {
  if (navigator.share) {
    navigator.share({
      title: `실종자 정보: ${person.name}`,
      text: `${person.name} (${person.age}세)님이 ${person.location.address}에서 실종되었습니다.`,
      url: window.location.href
    });
  } else {
    // 폴백: 클립보드 복사
    const text = `실종자 정보\n이름: ${person.name}\n나이: ${person.age}세\n장소: ${person.location.address}`;
    navigator.clipboard.writeText(text);
    toast.info('정보가 클립보드에 복사되었습니다');
  }
}
```

### 3.5 지역 필터 패널

```typescript
// components/FilterPanel.tsx
import React from 'react';
import { useEmergencyStore } from '../stores/emergencyStore';

const KOREAN_REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도'
];

export default function FilterPanel() {
  const { filters, updateFilters } = useEmergencyStore();

  const handleRegionToggle = (region: string) => {
    const newRegions = filters.regions.includes(region)
      ? filters.regions.filter(r => r !== region)
      : [...filters.regions, region];
    updateFilters({ regions: newRegions });
  };

  const handleTypeToggle = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type];
    updateFilters({ types: newTypes });
  };

  return (
    <div className="filter-panel" style={{ 
      padding: '20px', 
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #dee2e6'
    }}>
      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        {/* 지역 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px' }}>지역 선택</h3>
          <select
            multiple
            value={filters.regions}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
              updateFilters({ regions: selected });
            }}
            style={{ 
              width: '200px', 
              height: '150px',
              padding: '5px',
              borderRadius: '5px',
              border: '1px solid #ced4da'
            }}
          >
            {KOREAN_REGIONS.map(region => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <button
            onClick={() => updateFilters({ regions: [] })}
            style={{ 
              marginTop: '5px', 
              width: '100%',
              padding: '5px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            전체 지역
          </button>
        </div>

        {/* 유형 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px' }}>실종자 유형</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { value: 'missing_child', label: '실종 아동' },
              { value: 'disabled', label: '지적장애인' },
              { value: 'dementia', label: '치매환자' }
            ].map(({ value, label }) => (
              <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={filters.types.includes(value)}
                  onChange={() => handleTypeToggle(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 시간 범위 필터 */}
        <div>
          <h3 style={{ marginBottom: '10px' }}>기간 선택</h3>
          <select
            value={filters.timeRange}
            onChange={(e) => updateFilters({ timeRange: e.target.value as any })}
            style={{ 
              width: '150px',
              padding: '8px',
              borderRadius: '5px',
              border: '1px solid #ced4da'
            }}
          >
            <option value="24h">최근 24시간</option>
            <option value="7d">최근 7일</option>
            <option value="30d">최근 30일</option>
            <option value="all">전체</option>
          </select>
        </div>
      </div>
    </div>
  );
}
```

### 3.6 연결 상태 표시

```typescript
// components/ConnectionStatus.tsx
import React from 'react';

interface Props {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: Props) {
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 1000,
      padding: '10px 20px',
      borderRadius: '25px',
      backgroundColor: isConnected ? '#27ae60' : '#e74c3c',
      color: 'white',
      fontWeight: 'bold',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }}>
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: 'white',
        animation: isConnected ? 'pulse 2s infinite' : 'none'
      }} />
      {isConnected ? '실시간 연결 중' : '연결 끊김'}
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
```

---

## 4. 마커 클러스터링 구현

대량의 마커를 효율적으로 표시하기 위해 클러스터링을 추가합니다.

```typescript
// components/ClusteredMarkers.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useMap } from '@vis.gl/react-google-maps';
import type { Marker } from '@googlemaps/markerclusterer';

export function useMarkerClustering(markers: MissingPerson[]) {
  const map = useMap();
  const [markerObjects, setMarkerObjects] = useState<{[key: string]: Marker}>({});
  const clustererRef = useRef<MarkerClusterer | null>(null);

  // 클러스터러 초기화
  useEffect(() => {
    if (!map) return;
    
    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({
        map,
        algorithmOptions: {
          radius: 100, // 클러스터 반경 (픽셀)
          maxZoom: 15  // 이 줌 레벨 이상에서는 클러스터링 해제
        }
      });
    }
  }, [map]);

  // 마커 변경 시 클러스터 업데이트
  useEffect(() => {
    if (!clustererRef.current) return;
    
    clustererRef.current.clearMarkers();
    clustererRef.current.addMarkers(Object.values(markerObjects));
  }, [markerObjects]);

  const setMarkerRef = useCallback((marker: Marker | null, key: string) => {
    setMarkerObjects(prev => {
      if (marker) {
        return { ...prev, [key]: marker };
      } else {
        const newMarkers = { ...prev };
        delete newMarkers[key];
        return newMarkers;
      }
    });
  }, []);

  return { setMarkerRef };
}
```

---

## 5. 성능 최적화 전략

### 5.1 배치 업데이트

```typescript
// hooks/useBatchedUpdates.ts
import { useRef, useCallback } from 'react';

export function useBatchedUpdates<T>(
  updateFunction: (items: T[]) => void,
  batchInterval: number = 500
) {
  const queueRef = useRef<T[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const queueUpdate = useCallback((item: T) => {
    queueRef.current.push(item);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (queueRef.current.length > 0) {
        updateFunction(queueRef.current);
        queueRef.current = [];
      }
    }, batchInterval);
  }, [updateFunction, batchInterval]);

  return queueUpdate;
}

// 사용 예시
const queueUpdate = useBatchedUpdates(
  (persons: MissingPerson[]) => {
    persons.forEach(person => addMissingPerson(person));
  },
  500 // 500ms마다 배치 처리
);
```

### 5.2 가상 스크롤링 (사이드바용)

```typescript
import { FixedSizeList } from 'react-window';

function MissingPersonsList({ persons }: { persons: MissingPerson[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={persons.length}
      itemSize={100}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <PersonCard person={persons[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## 6. 반응형 디자인 & 모바일 최적화

```css
/* styles/responsive.css */

/* 데스크톱 */
.emergency-map-container {
  display: grid;
  grid-template-columns: 350px 1fr;
  height: 100vh;
}

.filter-panel {
  overflow-y: auto;
  border-right: 1px solid #dee2e6;
}

/* 태블릿 */
@media (max-width: 1024px) {
  .emergency-map-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  
  .filter-panel {
    border-right: none;
    border-bottom: 1px solid #dee2e6;
  }
}

/* 모바일 */
@media (max-width: 768px) {
  .filter-panel {
    padding: 10px;
  }
  
  .filter-panel > div {
    flex-direction: column;
  }
  
  .info-window-content {
    max-width: 250px !important;
  }
  
  .info-window-content img {
    max-height: 150px !important;
  }
}

/* PWA 지원 - 전체 화면 */
@media (display-mode: standalone) {
  .emergency-map-container {
    height: 100vh;
    height: -webkit-fill-available;
  }
}
```

---

## 7. 전체 시스템 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    경찰청 / 행정안전부 API                      │
│              (data.go.kr / safetydata.go.kr)                 │
│                    REST API (JSON/XML)                        │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP 폴링 (10-60초 간격)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Node.js 백엔드 서버                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • API 폴링 스케줄러 (node-cron)                       │   │
│  │  • 중복 제거 로직 (Set, Map)                          │   │
│  │  • 데이터 캐싱 (Redis 선택사항)                        │   │
│  │  • WebSocket 서버 (ws 라이브러리)                     │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket (실시간 푸시)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    React 프론트엔드                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  상태 관리 (Zustand)                                   │   │
│  │  ├─ missingPersons: MissingPerson[]                  │   │
│  │  ├─ filters: FilterState                             │   │
│  │  └─ connectionStatus: boolean                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WebSocket 훅 (react-use-websocket)                   │   │
│  │  ├─ 자동 재연결                                        │   │
│  │  ├─ 하트비트 (25초마다)                                │   │
│  │  └─ 오류 처리                                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  UI 컴포넌트                                           │   │
│  │  ├─ Google Maps (@vis.gl/react-google-maps)         │   │
│  │  ├─ 마커 클러스터링 (@googlemaps/markerclusterer)     │   │
│  │  ├─ 필터 패널                                          │   │
│  │  ├─ 알림 (react-toastify)                            │   │
│  │  └─ 상세 정보 모달                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            브라우저 API                                        │
│  • Notification API (브라우저 알림)                           │
│  • Web Audio API (알림음)                                    │
│  • Web Share API (공유 기능)                                 │
│  • Service Worker (PWA 오프라인 지원)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 배포 및 운영 가이드

### 8.1 환경 변수 설정

```bash
# 백엔드 .env
NODE_ENV=production
DATA_GO_KR_API_KEY=your_service_key
SAFETY_DATA_API_KEY=your_service_key
WS_PORT=8080
POLL_INTERVAL_EMERGENCY=10000  # 10초
POLL_INTERVAL_GENERAL=30000    # 30초

# 프론트엔드 .env
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
REACT_APP_MAP_ID=your_map_id
REACT_APP_WS_URL=wss://your-domain.com
```

### 8.2 Google Maps API 비용 최적화

**2025년 3월 신규 요금제 기준**:
- **Dynamic Maps**: 월 10,000건 무료, 이후 1,000건당 $7
- **예상 비용** (일 1,000명 사용자):
  - 30,000 맵 로드/월 → 무료 10,000건 제외 → 20,000건
  - 비용: 20 × $7 = **월 $140**

**최적화 팁**:
1. Map ID를 사용하여 벡터 맵 로드 (더 빠르고 저렴)
2. Static Maps를 썸네일에 사용 (1,000건당 $2)
3. 사용량 할당량 설정으로 과금 방지
4. 마커 클러스터링으로 API 호출 감소

### 8.3 PWA (Progressive Web App) 설정

```javascript
// public/service-worker.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.message,
    icon: '/icons/emergency-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: {
      url: data.url
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
```

```json
// public/manifest.json
{
  "short_name": "실종자알림",
  "name": "실시간 실종자 재난 알림",
  "icons": [
    {
      "src": "/icons/emergency-192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "/icons/emergency-512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": "/",
  "background_color": "#ffffff",
  "display": "standalone",
  "theme_color": "#e74c3c",
  "description": "실시간 실종자 및 긴급재난 정보를 지도에서 확인하세요"
}
```

---

## 9. 핵심 권장사항

### API 사용 전략
1. **개발계정으로 시작**: 일일 1,000건 한도로 테스트
2. **운영계정 신청**: 프로덕션 배포 2주 전 신청 (승인 2-3일 소요)
3. **사용 사례 등록**: 트래픽 증량을 위해 활용 사례 갤러리에 등록
4. **폴링 간격 최적화**: 실종경보는 10초, 일반 데이터는 30-60초

### 기술 스택 선택
- **프론트엔드**: React + TypeScript + @vis.gl/react-google-maps (2025년 공식 권장)
- **상태 관리**: Zustand (가볍고 간단, Redux보다 번들 크기 90% 감소)
- **실시간 통신**: react-use-websocket (자동 재연결, SSE 폴백 지원)
- **백엔드**: Node.js + Express + ws (가볍고 빠른 WebSocket)
- **스케줄링**: node-cron (간단한 폴링 스케줄러)

### 성능 최적화
1. **마커 200개 이상**: 반드시 클러스터링 사용
2. **실시간 업데이트**: 500ms 배치 처리로 리렌더링 최소화
3. **메모이제이션**: React.memo, useMemo, useCallback 적극 활용
4. **가상 스크롤링**: 목록이 100개 이상일 때 react-window 사용

### 사용자 경험
1. **브라우저 알림 권한**: 첫 방문 시 명확한 가이드 제공
2. **오프라인 지원**: Service Worker로 PWA 구현
3. **모바일 최적화**: 터치 제스처, 반응형 디자인 필수
4. **접근성**: ARIA 레이블, 키보드 네비게이션 지원

### 보안 고려사항
1. **API 키 보호**: 
   - 백엔드에서만 공공데이터 API 호출
   - Google Maps API 키는 HTTP 리퍼러 제한 설정
2. **CORS 설정**: 백엔드에서 허용된 도메인만 WebSocket 연결 허용
3. **Rate Limiting**: Express에서 rate-limiter-flexible 사용

---

## 10. 추가 리소스

### 공식 문서
- **공공데이터포털**: https://www.data.go.kr
- **재난안전데이터 플랫폼**: https://www.safetydata.go.kr
- **Google Maps Platform**: https://developers.google.com/maps
- **@vis.gl/react-google-maps**: https://visgl.github.io/react-google-maps

### 예제 프로젝트
- **Beacon-2023**: https://github.com/Beacon-2023/Beacon-backend (재난문자 스크래핑 예제)
- **Google Maps React Examples**: https://github.com/visgl/react-google-maps/tree/main/examples

### 커뮤니티
- 네이버 개발자 카페: 공공데이터 API 활용 팁
- GitHub Discussions: react-google-maps 기술 지원

---

## 결론

이 웹앱은 **3-tier 아키텍처** (공공 API → Node.js 백엔드 → React 프론트엔드)를 통해 경찰청 REST API의 제약사항을 극복하고 실시간에 가까운 사용자 경험을 제공합니다. 백엔드에서 지능형 폴링으로 새 데이터를 수집하고, WebSocket으로 프론트엔드에 즉시 푸시하며, React와 Google Maps의 최신 기술로 직관적인 UI를 구현합니다. 

**핵심은 "공공 API의 폴링 제약을 백엔드에서 해결하고, 프론트엔드는 WebSocket을 통해 진정한 실시간 경험을 제공"하는 것입니다.** 이 접근법으로 사용자는 마치 실시간 API를 사용하는 것처럼 즉각적인 알림을 받을 수 있습니다.