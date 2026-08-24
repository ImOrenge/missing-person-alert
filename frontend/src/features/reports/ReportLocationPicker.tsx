import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { loadGoogleMapsScript } from '../../utils/googleMapsLoader';
import type { ReportLocationInput } from '../../types/reporting';

interface ReportLocationPickerProps {
  value: ReportLocationInput | null;
  onChange: (location: ReportLocationInput) => void;
}

export default function ReportLocationPicker({ value, onChange }: ReportLocationPickerProps) {
  const [query, setQuery] = useState(value?.address || '');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    loadGoogleMapsScript().then((maps) => {
      if (!active) return;
      const container = document.createElement('div');
      container.hidden = true;
      document.body.appendChild(container);
      containerRef.current = container;
      googleRef.current = maps;
      autocompleteRef.current = new maps.maps.places.AutocompleteService();
      placesRef.current = new maps.maps.places.PlacesService(container);
      setReady(true);
    }).catch(() => active && setError('주소 검색 서비스를 불러오지 못했습니다.'));
    return () => {
      active = false;
      containerRef.current?.remove();
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const input = query.trim();
    if (!ready || input.length < 2 || input === value?.address) {
      setPredictions([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      autocompleteRef.current?.getPlacePredictions({ input, componentRestrictions: { country: 'kr' }, types: ['geocode'] }, (items, status) => {
        setLoading(false);
        if (status === googleRef.current?.maps.places.PlacesServiceStatus.OK && items) {
          setPredictions(items);
          setError(null);
        } else {
          setPredictions([]);
          setError('검색 결과가 없습니다. 다른 주소를 입력해 주세요.');
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, ready, value?.address]);

  const select = (prediction: google.maps.places.AutocompletePrediction) => {
    setLoading(true);
    placesRef.current?.getDetails({ placeId: prediction.place_id, fields: ['formatted_address', 'geometry'] }, (place, status) => {
      setLoading(false);
      if (status !== googleRef.current?.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
        setError('선택한 장소의 위치를 확인하지 못했습니다.');
        return;
      }
      const location = {
        address: place.formatted_address || prediction.description,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: prediction.place_id,
      };
      onChange(location);
      setQuery(location.address);
      setPredictions([]);
      setError(null);
    });
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">목격 위치 주소 검색</span>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={!ready} placeholder={ready ? '주소를 검색해 선택하세요' : '주소 검색 준비 중'} className="h-11 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" />
      </label>
      {loading && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500" role="status"><Loader2 className="animate-spin" size={14} />주소를 확인하고 있습니다.</p>}
      {predictions.length > 0 && <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">{predictions.map((item) => <li key={item.place_id}><button type="button" onClick={() => select(item)} className="flex w-full items-start gap-2 p-3 text-left text-sm hover:bg-slate-50"><MapPin className="mt-0.5 flex-none text-[#d94841]" size={16} /><span><strong className="block text-slate-800">{item.structured_formatting.main_text}</strong><span className="mt-0.5 block text-xs text-slate-500">{item.structured_formatting.secondary_text}</span></span></button></li>)}</ul>}
      {value && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-bold text-[#1e3a5f]"><MapPin className="mr-1 inline" size={15} />{value.address}</p>}
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">정확한 좌표는 비공개 원본에만 저장되며 공개 화면에는 그대로 표시되지 않습니다.</p>
    </div>
  );
}
