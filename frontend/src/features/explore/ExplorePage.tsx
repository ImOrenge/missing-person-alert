import React, { useEffect, useState } from 'react';
import { Grid3X3, List, Map as MapIcon, PanelLeft, Search } from 'lucide-react';
import EmergencyMap from '../../components/EmergencyMap';
import { useEmergencyStore } from '../../stores/emergencyStore';
import type { MissingPerson } from '../../types';
import ExploreCaseList from './ExploreCaseList';
import { useExploreState } from './use-explore-state';
import type { ExploreViewMode } from './use-explore-state';
import { fetchPublicMapReports } from '../../services/exploreService';
import type { PublicMapBounds } from '../../services/exploreService';
import type { PublicMapReportDto } from '../../types/publicReport';
import PublicReportList from './PublicReportList';
import { logPublicImpactEvent } from '../../services/analyticsService';
import { PUBLIC_IMPACT_EVENT_NAMES } from '../../services/analytics/events';

interface ExplorePageProps {
  persons: MissingPerson[];
  reportMapLayerEnabled: boolean;
  onOpenCommunity: (personId?: string) => void;
  onOpenCaseNews: (personId: string) => void;
  sourceTraceEnabled?: boolean;
}

const VIEW_ITEMS: Array<{ id: ExploreViewMode; label: string; icon: React.ReactNode }> = [
  { id: 'split', label: '분할', icon: <PanelLeft size={16} /> },
  { id: 'map', label: '지도', icon: <MapIcon size={16} /> },
  { id: 'list', label: '목록', icon: <List size={16} /> },
  { id: 'cards', label: '카드', icon: <Grid3X3 size={16} /> },
];

export default function ExplorePage({ persons, reportMapLayerEnabled, onOpenCommunity, onOpenCaseNews, sourceTraceEnabled = false }: ExplorePageProps) {
  const { view, setView } = useExploreState();
  const selectedPersonId = useEmergencyStore((state) => state.selectedPersonId);
  const setSelectedPersonId = useEmergencyStore((state) => state.setSelectedPersonId);
  const setHoveredPersonId = useEmergencyStore((state) => state.setHoveredPersonId);
  const [publicReports, setPublicReports] = useState<PublicMapReportDto[]>([]);
  const [selectedPublicReportId, setSelectedPublicReportId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('publicReportId'));
  const [reportLayerEnabled, setReportLayerEnabled] = useState(reportMapLayerEnabled);
  const [appliedBounds, setAppliedBounds] = useState<PublicMapBounds>({ west: 124, south: 33, east: 132, north: 39.5, zoom: 7 });
  const [pendingBounds, setPendingBounds] = useState<PublicMapBounds | null>(null);
  const showMap = view === 'split' || view === 'map';
  const showList = view === 'split' || view === 'list' || view === 'cards';

  useEffect(() => {
    if (showMap) {
      logPublicImpactEvent(PUBLIC_IMPACT_EVENT_NAMES.MAP_VIEW, { route_group: 'map' });
    }
  }, [showMap]);

  useEffect(() => {
    setReportLayerEnabled(reportMapLayerEnabled);
  }, [reportMapLayerEnabled]);

  useEffect(() => {
    const controller = new AbortController();
    if (!reportLayerEnabled) {
      setPublicReports([]);
      return () => controller.abort();
    }
    fetchPublicMapReports(controller.signal, appliedBounds).then(setPublicReports).catch(() => setPublicReports([]));
    return () => controller.abort();
  }, [appliedBounds, reportLayerEnabled]);

  const selectPerson = (personId: string) => {
    setSelectedPersonId(personId);
    setHoveredPersonId(personId);
    if (view === 'list' || view === 'cards') setView('split');
  };

  const selectPublicReport = (reportId: string | null) => {
    setSelectedPublicReportId(reportId);
    const url = new URL(window.location.href);
    if (reportId) url.searchParams.set('publicReportId', reportId);
    else url.searchParams.delete('publicReportId');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <div className="f-explore-workspace" data-view={view}>
      <div className="f-explore-toolbar">
        <div className="f-explore-toolbar__heading">
          <div><p className="text-sm font-black text-slate-950">지도·목록 통합 탐색</p><p className="mt-0.5 text-xs text-slate-500">목록과 지도는 같은 선택 상태를 공유합니다.</p></div>
          <div className="f-explore-summary" aria-live="polite"><span><strong>{persons.length}</strong> 공식 사건</span><span><strong>{reportLayerEnabled ? publicReports.length : 0}</strong> 공개 제보</span></div>
        </div>
        <div className="f-explore-toolbar__controls"><div className="flex rounded-xl bg-slate-100 p-1" aria-label="지도 레이어"><button type="button" aria-pressed="true" className="rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-[#1e3a5f] shadow-sm">공식 사건</button><button type="button" disabled={!reportMapLayerEnabled} onClick={() => setReportLayerEnabled((current) => !current)} aria-pressed={reportLayerEnabled} className={`rounded-lg px-2.5 py-2 text-xs font-bold ${reportLayerEnabled ? 'bg-amber-100 text-amber-900' : 'text-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}>{reportMapLayerEnabled ? '승인 제보' : '승인 제보 준비 중'}</button></div>{pendingBounds && <button type="button" onClick={() => { setAppliedBounds(pendingBounds); setPendingBounds(null); }} className="flex items-center gap-1 rounded-lg bg-[#d94841] px-3 py-2 text-xs font-black text-white"><Search size={14} />이 지역 검색</button>}<div className="flex rounded-xl bg-slate-100 p-1" aria-label="탐색 보기 방식">
          {VIEW_ITEMS.map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} aria-pressed={view === item.id} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${view === item.id ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.icon}<span className="hidden sm:inline">{item.label}</span></button>)}
        </div></div>
      </div>
      <div className={`f-explore-stage grid min-h-0 flex-1 ${view === 'split' ? 'md:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]' : 'grid-cols-1'}`}>
        {showMap && <div className={`${view === 'split' ? 'hidden md:block' : ''} relative min-h-0`}><EmergencyMap onOpenCommunity={(id) => onOpenCommunity(id)} onOpenCaseNews={onOpenCaseNews} publicReports={reportLayerEnabled ? publicReports : []} selectedPublicReportId={selectedPublicReportId} onSelectPublicReport={selectPublicReport} onViewportChange={(bounds) => { const changed = Math.abs(bounds.west - appliedBounds.west) > 0.02 || Math.abs(bounds.east - appliedBounds.east) > 0.02 || Math.abs(bounds.south - appliedBounds.south) > 0.02 || Math.abs(bounds.north - appliedBounds.north) > 0.02 || Math.abs(bounds.zoom - appliedBounds.zoom) >= 1; setPendingBounds(changed ? bounds : null); }} sourceTraceEnabled={sourceTraceEnabled} /></div>}
        {showList && <div className="flex min-h-0 flex-col border-l border-slate-200">{reportLayerEnabled && <PublicReportList items={publicReports} selectedId={selectedPublicReportId} onSelect={selectPublicReport} />}<div className="min-h-0 flex-1"><ExploreCaseList persons={persons} view={view} selectedPersonId={selectedPersonId} onSelect={selectPerson} /></div></div>}
      </div>
    </div>
  );
}
