import React, { useState } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { useEmergencyStore } from '../stores/emergencyStore';
import { useFirebaseData } from '../hooks/useFirebaseData';
import MarkerWithInfo from './MarkerWithInfo';

const KOREA_CENTER = { lat: 37.5665, lng: 126.9780 }; // 서울
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = process.env.REACT_APP_MAP_ID || '';

export default function EmergencyMap() {
  const getFilteredPersons = useEmergencyStore((state) => state.getFilteredPersons);
  const missingPersons = useEmergencyStore((state) => state.missingPersons);
  const selectedPersonId = useEmergencyStore((state) => state.selectedPersonId);
  const hoveredPersonId = useEmergencyStore((state) => state.hoveredPersonId);
  const setSelectedPersonId = useEmergencyStore((state) => state.setSelectedPersonId);
  const { isConnected } = useFirebaseData();

  const filteredPersons = getFilteredPersons();

  // 디버깅: 데이터 상태 로그
  React.useEffect(() => {
    console.log('📊 EmergencyMap 상태:');
    console.log('  - 전체 실종자:', missingPersons.length);
    console.log('  - 필터링된 실종자:', filteredPersons.length);
    console.log('  - 데이터:', filteredPersons);
  }, [missingPersons, filteredPersons]);

  // 첫 렌더링 시 알림 권한 요청
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // 앱 포커스 시 데이터 새로고침
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 앱이 다시 활성화됨 - 데이터 새로고침');
        // WebSocket이 연결되어 있으면 자동으로 최신 데이터를 받아옴
        window.location.reload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            ⚠️ Google Maps API 키가 필요합니다
          </h2>
          <p className="text-gray-600 max-w-xl">
            <code className="bg-gray-100 px-2 py-1 rounded">.env</code> 파일에{' '}
            <code className="bg-gray-100 px-2 py-1 rounded">REACT_APP_GOOGLE_MAPS_API_KEY</code>를
            설정해주세요.
            <br />
            Google Maps Platform에서 API 키를 발급받을 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={KOREA_CENTER}
          defaultZoom={7}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          zoomControl={true}
          mapTypeControl={true}
          streetViewControl={false}
          fullscreenControl={true}
          className="h-full w-full"
        >
          {filteredPersons.map((person) => {
            const isSelected = selectedPersonId === person.id;
            const isHovered = hoveredPersonId === person.id;

            return (
              <MarkerWithInfo
                key={person.id}
                person={person}
                isSelected={isSelected}
                isHighlighted={isHovered}
                onClick={() => setSelectedPersonId(person.id)}
                onClose={() => setSelectedPersonId(null)}
              />
            );
          })}
        </Map>
      </APIProvider>

     </div>
);
}
