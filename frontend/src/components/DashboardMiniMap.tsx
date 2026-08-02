import React, { memo, useEffect } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import { ArrowRight, MapPin, UserCircle } from 'lucide-react';
import type { MissingPerson, MissingPersonType } from '../types';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = process.env.REACT_APP_MAP_ID || '';
const MINI_MAP_CENTER = { lat: 36.45, lng: 127.9 };

type DashboardMiniMapProps = {
  persons: MissingPerson[];
  selectedPersonId: string | null;
  onSelectPerson: (personId: string | null) => void;
  onOpenMap: (personId?: string) => void;
};

const getPinColor = (type: MissingPersonType): string => {
  switch (type) {
    case 'missing_child': return '#d94841';
    case 'runaway': return '#2878b5';
    case 'disabled': return '#d18b18';
    case 'dementia': return '#8054a8';
    case 'facility': return '#2f855a';
    default: return '#64748b';
  }
};

const getTypeLabel = (type: MissingPersonType): string => {
  switch (type) {
    case 'missing_child': return '실종 아동';
    case 'runaway': return '가출인';
    case 'disabled': return '지적장애인';
    case 'dementia': return '치매환자';
    case 'facility': return '시설보호자';
    default: return '신원불상';
  }
};

const genderLabel = (gender: string): string => gender === 'M' ? '남성' : gender === 'F' ? '여성' : '성별 미상';

function MiniMapViewport({ persons, selectedPersonId, onSelectPerson }: Omit<DashboardMiniMapProps, 'onOpenMap'>) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedPersonId) return;
    const selectedPerson = persons.find((person) => person.id === selectedPersonId);
    if (!selectedPerson) return;
    map.panTo(selectedPerson.location);
    if ((map.getZoom() || 7) < 10) map.setZoom(10);
  }, [map, persons, selectedPersonId]);

  return (
    <>
      {persons.map((person) => (
        <MiniMapMarker
          key={person.id}
          person={person}
          isSelected={person.id === selectedPersonId}
          onSelect={onSelectPerson}
        />
      ))}
    </>
  );
}

type MiniMapMarkerProps = {
  person: MissingPerson;
  isSelected: boolean;
  onSelect: (personId: string | null) => void;
};

const MiniMapMarker = memo(function MiniMapMarker({ person, isSelected, onSelect }: MiniMapMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={person.location}
        title={`${person.name} · ${getTypeLabel(person.type)}`}
        zIndex={isSelected ? 100 : 1}
        onClick={() => onSelect(person.id)}
      >
        <Pin
          background={getPinColor(person.type)}
          borderColor="#ffffff"
          glyphColor="#ffffff"
          scale={isSelected ? 1.25 : 0.9}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(null)} maxWidth={280}>
          <div className="min-w-[220px] p-1 text-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                {person.photos?.[0] || person.photo ? (
                  <img src={person.photos?.[0] || person.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserCircle size={25} className="text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-slate-950">{person.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{person.age}세 · {genderLabel(person.gender)} · {getTypeLabel(person.type)}</p>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-1 text-xs leading-5 text-slate-600"><MapPin size={14} className="mt-0.5 flex-none text-[#d94841]" /> {person.location.address}</p>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="mt-3 flex w-full items-center justify-between rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
            >
              선택 해제 <ArrowRight size={14} />
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
});

export default function DashboardMiniMap({ persons, selectedPersonId, onSelectPerson, onOpenMap }: DashboardMiniMapProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-slate-100 p-6 text-center">
        <div>
          <p className="font-bold text-slate-700">Google Maps API 키가 필요합니다.</p>
          <p className="mt-1 text-xs text-slate-500">REACT_APP_GOOGLE_MAPS_API_KEY를 환경변수에 설정해 주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[300px] overflow-hidden rounded-xl border border-slate-200 bg-[#edf3f7]">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={MINI_MAP_CENTER}
          defaultZoom={7}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          fullscreenControl
          streetViewControl={false}
          mapTypeControl={false}
          className="h-full w-full"
        >
          <MiniMapViewport
            persons={persons}
            selectedPersonId={selectedPersonId}
            onSelectPerson={onSelectPerson}
          />
        </Map>
      </APIProvider>

      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur">
        최근 실종자 {persons.length}명
      </div>
      <button
        type="button"
        onClick={() => onOpenMap(selectedPersonId || undefined)}
        className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-white"
      >
        전체 지도에서 보기 <ArrowRight size={14} />
      </button>
    </div>
  );
}
