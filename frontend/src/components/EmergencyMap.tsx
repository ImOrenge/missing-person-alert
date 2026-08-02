import React from 'react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useEmergencyStore } from '../stores/emergencyStore';
import MarkerWithInfo from './MarkerWithInfo';

const KOREA_CENTER = { lat: 37.5665, lng: 126.9780 }; // 서울
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = process.env.REACT_APP_MAP_ID || '';

// 마커 애니메이션을 처리하는 내부 컴포넌트
function MapContent({ onOpenCommunity }: { onOpenCommunity?: (personId: string) => void }) {
  const map = useMap();
  const getFilteredPersons = useEmergencyStore((state) => state.getFilteredPersons);
  const selectedPersonId = useEmergencyStore((state) => state.selectedPersonId);
  const hoveredPersonId = useEmergencyStore((state) => state.hoveredPersonId);
  const setSelectedPersonId = useEmergencyStore((state) => state.setSelectedPersonId);

  const filteredPersons = getFilteredPersons();

  // hoveredPersonId 변경 시 해당 마커로 부드럽게 이동하고 확대
  React.useEffect(() => {
    if (!map || !hoveredPersonId) return;

    const hoveredPerson = filteredPersons.find(p => p.id === hoveredPersonId);
    if (!hoveredPerson) return;

    // 부드러운 애니메이션으로 마커 위치로 이동하며 확대
    map.panTo(hoveredPerson.location);

    // 현재 줌 레벨 확인
    const currentZoom = map.getZoom() || 7;

    // 줌 레벨이 13 미만이면 확대
    if (currentZoom < 13) {
      map.setZoom(13);
    }
  }, [hoveredPersonId, map, filteredPersons]);

  // hoveredPersonId가 null로 변경되면 원래 줌으로 복귀
  React.useEffect(() => {
    if (!map || hoveredPersonId !== null) return;

    // 약간의 지연 후 원래 줌 레벨로 부드럽게 복귀
    const timer = setTimeout(() => {
      const currentZoom = map.getZoom() || 7;
      if (currentZoom > 7) {
        map.setZoom(Math.max(7, currentZoom - 3));
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [hoveredPersonId, map]);

  return (
    <>
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
            onOpenCommunity={onOpenCommunity}
          />
        );
      })}
    </>
  );
}

export default function EmergencyMap({ onOpenCommunity }: { onOpenCommunity?: (personId: string) => void }) {
  const missingPersons = useEmergencyStore((state) => state.missingPersons);
  const getFilteredPersons = useEmergencyStore((state) => state.getFilteredPersons);

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
  // React.useEffect(() => {
  //   const handleVisibilityChange = () => {
  //     if (document.visibilityState === 'visible') {
  //       console.log('📱 앱이 다시 활성화됨 - 데이터 새로고침');
  //       // WebSocket이 연결되어 있으면 자동으로 최신 데이터를 받아옴
  //       window.location.reload();
  //     }
  //   };

  //   document.addEventListener('visibilitychange', handleVisibilityChange);

  //   return () => {
  //     document.removeEventListener('visibilitychange', handleVisibilityChange);
  //   };
  // }, []);

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
          <MapContent onOpenCommunity={onOpenCommunity} />
        </Map>
      </APIProvider>

    </div>
  );
}
