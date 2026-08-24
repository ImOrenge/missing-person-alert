import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  Bell,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Home,
  Info,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  Siren,
  UserCircle,
} from 'lucide-react';
import type { Announcement } from '../types/announcement';
import type { MissingPerson, MissingPersonType } from '../types';
import type { NaverNewsItem } from '../types/news';
import DashboardMiniMap from './DashboardMiniMap';
import NewsSummarySection from './news/NewsSummarySection';
import { useDashboardPreferences } from '../features/dashboard/use-dashboard-preferences';
import DashboardSectionSurface from '../features/dashboard/DashboardSectionSurface';
import { fetchPublicMapReports } from '../services/exploreService';
import { listOwnReportsV2 } from '../services/reportingService';
import type { PublicMapReportDto } from '../types/publicReport';
import type { OwnReportListItemDto } from '../types/reporting';

interface DashboardHomeProps {
  persons: MissingPerson[];
  hasLoadedPersons: boolean;
  announcements: Announcement[];
  currentUser: User | null;
  statsUpdatedLabel?: string;
  pushStatus: string;
  newsItems: NaverNewsItem[];
  newsLoading: boolean;
  newsError: string | null;
  reportMapLayerEnabled: boolean;
  onOpenSearch: (query?: string) => void;
  onOpenMap: (personId?: string) => void;
  onOpenCommunity: (personId?: string) => void;
  onOpenNews: (articleId?: string) => void;
  onOpenCaseNews: (personId: string) => void;
  onRetryNews: () => void;
  onOpenRegion: (region: string) => void;
  onOpenStatistics: () => void;
  onOpenGrid: () => void;
  onOpenReport: () => void;
  onOpenAlerts: () => void;
  onOpenMyReports: () => void;
  onOpenPublicReports: () => void;
  onOpenLogin: () => void;
  onOpenProfile: () => void;
  onEnablePush: () => void | Promise<void>;
  hideLegacyMobileNav?: boolean;
  personalizationEnabled?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const REGION_ALIASES: Record<string, string> = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
  광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
  전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도',
  제주: '제주특별자치도',
};

const TYPE_LABELS: Record<MissingPersonType, string> = {
  missing_child: '실종 아동', runaway: '가출인', disabled: '지적장애인',
  dementia: '치매환자', facility: '시설보호자', unknown: '신원불상',
};

const getTimestamp = (person: MissingPerson): number => {
  const missingDate = new Date(person.missingDate).getTime();
  return Number.isFinite(missingDate) ? missingDate : person.updatedAt ?? 0;
};

const getRegion = (person: MissingPerson): string => {
  const address = person.location?.address?.trim();
  if (!address) return '지역 미상';
  const token = address.split(/\s+/).find((item) => item && item !== '대한민국') || '지역 미상';
  return REGION_ALIASES[token] || token;
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미상';
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
};

const elapsed = (value: string): string => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '등록일 확인 필요';
  const hours = Math.max(0, Math.floor((Date.now() - time) / (60 * 60 * 1000)));
  if (hours < 1) return '방금 전';
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

const genderLabel = (gender: string): string => gender === 'M' ? '남성' : gender === 'F' ? '여성' : '성별 미상';

function PersonPhoto({ person, compact = false }: { person: MissingPerson; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = person.photos?.[0] || person.photo;
  if (!source || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-100 text-slate-400 ${compact ? '' : 'rounded-xl'}`}>
        <UserCircle size={compact ? 30 : 44} strokeWidth={1.4} />
      </div>
    );
  }
  return <img src={source} alt={`${person.name} 실종자 사진`} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />;
}

export default function DashboardHome({
  persons, hasLoadedPersons, currentUser,
  newsItems, newsLoading, newsError, reportMapLayerEnabled, onOpenSearch, onOpenMap, onOpenCommunity, onOpenNews, onOpenCaseNews, onRetryNews,
  onOpenRegion, onOpenStatistics, onOpenGrid, onOpenReport,
  onOpenAlerts,
  onOpenMyReports, onOpenPublicReports, onOpenLogin, onOpenProfile,
  hideLegacyMobileNav = false,
  personalizationEnabled = false,
}: DashboardHomeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [selectedMapPersonId, setSelectedMapPersonId] = useState<string | null>(null);
  const [publicReports, setPublicReports] = useState<PublicMapReportDto[]>([]);
  const [publicReportsLoading, setPublicReportsLoading] = useState(true);
  const [ownReports, setOwnReports] = useState<OwnReportListItemDto[]>([]);
  const [ownReportsLoading, setOwnReportsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  const activePersons = useMemo(() => persons.filter((person) => person.status !== 'found'), [persons]);
  const recentPersons = useMemo(() => {
    const recent = activePersons.filter((person) => getTimestamp(person) >= now - 7 * DAY_MS);
    return (recent.length > 0 ? recent : activePersons).sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [activePersons, now]);
  const regionStats = useMemo(() => {
    const counts = new Map<string, number>();
    activePersons.forEach((person) => {
      const region = getRegion(person);
      counts.set(region, (counts.get(region) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count);
  }, [activePersons]);
  const visiblePersons = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ko-KR');
    return recentPersons.filter((person) => {
      const matchesRegion = selectedRegion === '전체' || getRegion(person) === selectedRegion;
      const matchesQuery = !query || [person.name, person.location?.address, person.clothes, TYPE_LABELS[person.type]]
        .filter(Boolean).some((value) => value!.toLocaleLowerCase('ko-KR').includes(query));
      return matchesRegion && matchesQuery;
    }).slice(0, 8);
  }, [recentPersons, searchQuery, selectedRegion]);
  const miniMapPersons = useMemo(() => recentPersons.slice(0, 80), [recentPersons]);
  const maxRegionCount = Math.max(1, ...regionStats.slice(0, 6).map((item) => item.count));
  const { preferences, moduleOrder } = useDashboardPreferences(currentUser, personalizationEnabled);
  const moduleStyle = (id: 'news' | 'region-summary') => personalizationEnabled ? {
    order: 50 + (moduleOrder.get(id) ?? 0),
    display: preferences.hidden.includes(id) ? 'none' : undefined,
  } : undefined;

  useEffect(() => {
    if (!reportMapLayerEnabled) {
      setPublicReports([]);
      setPublicReportsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setPublicReportsLoading(true);
    fetchPublicMapReports(controller.signal)
      .then((items) => setPublicReports(items.slice(0, 3)))
      .catch(() => !controller.signal.aborted && setPublicReports([]))
      .finally(() => !controller.signal.aborted && setPublicReportsLoading(false));
    return () => controller.abort();
  }, [reportMapLayerEnabled]);

  useEffect(() => {
    if (!currentUser) {
      setOwnReports([]);
      setOwnReportsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setOwnReportsLoading(true);
    listOwnReportsV2(controller.signal)
      .then((items) => setOwnReports(items.slice(0, 3)))
      .catch(() => !controller.signal.aborted && setOwnReports([]))
      .finally(() => !controller.signal.aborted && setOwnReportsLoading(false));
    return () => controller.abort();
  }, [currentUser]);

  const goTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  const focusSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchRef.current?.focus();
  };

  const selectMiniMapPerson = (personId: string) => {
    setSelectedMapPersonId(personId);
    document.getElementById('dashboard-mini-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const selectedMapPerson = visiblePersons.find((person) => person.id === selectedMapPersonId)
    || recentPersons.find((person) => person.id === selectedMapPersonId)
    || recentPersons[0];

  const submitSearch = () => onOpenSearch(searchQuery.trim() || undefined);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] text-slate-900">

      <main className={`mx-auto flex max-w-7xl flex-col px-4 pb-24 sm:px-6 lg:px-8 lg:pb-12 ${personalizationEnabled && preferences.density === 'compact' ? 'text-[0.96rem]' : ''}`}>
        <section id="dashboard-search" className="mt-6 overflow-hidden rounded-2xl bg-[#10213a] px-5 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-8 sm:py-9" aria-labelledby="dashboard-search-title" data-dashboard-module="search">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl"><p className="text-[11px] font-black tracking-[0.18em] text-cyan-200">MISSING PERSON SEARCH</p><h1 id="dashboard-search-title" className="mt-2 text-2xl font-black sm:text-3xl">실종자·지역·인상착의 통합 검색</h1><p className="mt-2 text-sm leading-6 text-slate-300">공식 사건, 운영 검토를 마친 공개 제보와 관련 뉴스를 한 번에 찾습니다.</p></div>
            <div className="w-full lg:max-w-2xl"><div className="flex gap-2"><label className="relative min-w-0 flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitSearch()} placeholder="이름·지역·인상착의를 입력하세요" className="h-12 w-full rounded-xl border border-white/20 bg-white pl-11 pr-4 text-sm text-slate-950 outline-none focus:ring-2 focus:ring-cyan-300" /></label><button type="button" onClick={submitSearch} className="h-12 flex-none rounded-xl bg-[#e34b43] px-5 text-sm font-black text-white hover:bg-[#cf4039]">검색</button></div><div className="mt-3 flex gap-2 overflow-x-auto text-xs font-bold"><button type="button" onClick={() => setSelectedRegion('전체')} className={`whitespace-nowrap rounded-full px-3 py-2 ${selectedRegion === '전체' ? 'bg-white text-[#10213a]' : 'bg-white/10 text-white'}`}>전국</button>{regionStats.slice(0, 3).map((item) => <button key={item.region} type="button" onClick={() => setSelectedRegion(item.region)} className={`whitespace-nowrap rounded-full px-3 py-2 ${selectedRegion === item.region ? 'bg-white text-[#10213a]' : 'bg-white/10 text-white'}`}>{item.region}</button>)}<button type="button" onClick={() => onOpenMap()} className="flex whitespace-nowrap rounded-full bg-white/10 px-3 py-2 text-white"><LocateFixed className="mr-1" size={14} />내 주변 보기</button><button type="button" onClick={() => document.getElementById('dashboard-urgent')?.scrollIntoView({ behavior: 'smooth' })} className="flex whitespace-nowrap rounded-full bg-white/10 px-3 py-2 text-white"><Clock3 className="mr-1" size={14} />최근 24시간</button></div></div>
          </div>
        </section>

        <DashboardSectionSurface id="dashboard-urgent" label="긴급·최근 공식 사건" moduleId="urgent-cases" className="mt-5 p-5 sm:p-6 lg:p-8">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black tracking-[0.16em] text-[#d94841]">URGENT CASES</p><h2 className="mt-2 text-xl font-black text-slate-950">긴급·최근 공식 사건</h2><p className="mt-1 text-sm text-slate-500">24시간 내 등록된 사건부터 우선 확인하세요.</p></div><button type="button" onClick={onOpenGrid} className="flex items-center gap-1 text-xs font-black text-[#1e3a5f]">전체 보기 <ArrowRight size={14} /></button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePersons.slice(0, 6).map((person) => { const urgent = getTimestamp(person) >= now - DAY_MS; return <article key={person.id} className="rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md"><button type="button" onClick={() => selectMiniMapPerson(person.id)} className="flex w-full gap-3 text-left"><div className="h-24 w-20 flex-none overflow-hidden rounded-lg bg-slate-100"><PersonPhoto person={person} compact /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded bg-blue-50 px-1.5 py-1 text-[10px] font-black text-[#1e3a5f]">공식정보</span>{urgent && <span className="rounded bg-red-50 px-1.5 py-1 text-[10px] font-black text-[#d94841]">24H</span>}</div><h3 className="mt-2 truncate font-black text-slate-950">{person.name}</h3><p className="mt-1 text-xs text-slate-500">{person.age ? `${person.age}세` : '나이 미상'} · {genderLabel(person.gender)}</p><p className="mt-2 flex items-start gap-1 text-xs leading-5 text-slate-600"><MapPin className="mt-0.5 flex-none" size={13} /><span className="line-clamp-2">{person.location.address}</span></p></div></button></article>; })}
            {visiblePersons.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">{hasLoadedPersons ? '조건에 맞는 공식 사건이 없습니다.' : '공식 사건을 확인하고 있습니다.'}</div>}
          </div>
        </DashboardSectionSurface>

        <DashboardSectionSurface id="dashboard-explore" label="지도와 선택 사건 목록" moduleId="case-details" className="mt-5 grid min-h-[430px] lg:grid-cols-[1.15fr_0.85fr]">
          <div id="dashboard-mini-map" className="min-h-[340px] p-4 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-950">지도 미리보기</h2><p className="mt-1 text-sm text-slate-500">공개 가능한 위치만 표시합니다.</p></div><button type="button" onClick={() => onOpenMap(selectedMapPerson?.id)} className="text-xs font-black text-[#1e3a5f]">전체 지도 <ArrowRight className="inline" size={14} /></button></div><div className="mt-4 h-[330px]"><DashboardMiniMap persons={miniMapPersons} selectedPersonId={selectedMapPerson?.id || null} onSelectPerson={setSelectedMapPersonId} onOpenMap={onOpenMap} /></div></div>
          <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-6 lg:border-l lg:border-t-0"><h2 className="text-xl font-black text-slate-950">선택 사건 목록</h2><p className="mt-1 text-sm text-slate-500">사진·공식 라벨·시각·축약 위치를 확인하세요.</p>{selectedMapPerson && <article className="mt-4 rounded-xl border border-[#1e3a5f]/20 bg-white p-4 shadow-sm"><div className="flex gap-3"><div className="h-20 w-20 flex-none overflow-hidden rounded-lg"><PersonPhoto person={selectedMapPerson} compact /></div><div className="min-w-0"><span className="rounded bg-blue-50 px-1.5 py-1 text-[10px] font-black text-[#1e3a5f]">공식정보</span><h3 className="mt-2 font-black text-slate-950">{selectedMapPerson.name}</h3><p className="mt-1 text-xs text-slate-500">{formatDate(selectedMapPerson.missingDate)} · {elapsed(selectedMapPerson.missingDate)}</p><p className="mt-1 line-clamp-2 text-xs text-slate-600">{selectedMapPerson.location.address}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black"><button type="button" onClick={() => onOpenCaseNews(selectedMapPerson.id)} className="rounded-lg bg-[#03c75a]/10 px-3 py-2 text-[#008f3e]">관련 뉴스</button><button type="button" onClick={() => onOpenMap(selectedMapPerson.id)} className="rounded-lg bg-[#1e3a5f] px-3 py-2 text-white">지도 상세</button></div></article>}<div className="mt-3 space-y-2">{visiblePersons.slice(0, 4).map((person) => <button key={`list-${person.id}`} type="button" onClick={() => setSelectedMapPersonId(person.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selectedMapPerson?.id === person.id ? 'border-[#1e3a5f] bg-white' : 'border-slate-200 bg-white/70'}`}><div className="h-10 w-10 flex-none overflow-hidden rounded-md"><PersonPhoto person={person} compact /></div><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{person.name}</strong><span className="block truncate text-xs text-slate-500">{person.location.address}</span></span><ChevronRight size={16} className="text-slate-300" /></button>)}</div></div>
        </DashboardSectionSurface>

        <section id="dashboard-actions" className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="빠른 안전 행동" data-dashboard-module="quick-actions"><button type="button" onClick={onOpenReport} className="flex items-center gap-4 rounded-2xl bg-[#d94841] p-5 text-left text-white shadow-sm"><span className="rounded-xl bg-white/15 p-3"><Plus size={22} /></span><span><strong className="block">목격 제보하기</strong><small className="mt-1 block text-red-100">시간과 장소를 안전하게 전달</small></span></button><button type="button" onClick={onOpenAlerts} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm"><span className="rounded-xl bg-blue-50 p-3 text-[#1e3a5f]"><Bell size={22} /></span><span><strong className="block text-slate-950">지역 알림 받기</strong><small className="mt-1 block text-slate-500">관심 사건과 지역을 설정</small></span></button><a href="tel:112" className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left shadow-sm"><span className="rounded-xl bg-white p-3 text-amber-700"><PhoneCall size={22} /></span><span><strong className="block text-slate-950">112 신고 안내</strong><small className="mt-1 block text-slate-600">현재 위험하면 온라인보다 신고 우선</small></span></a></section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2" aria-label="제보 요약">
          <DashboardSectionSurface id="dashboard-public-reports" label="검토된 최근 공개 제보" moduleId="public-reports" className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">검토된 최근 공개 제보</h2><p className="mt-1 text-xs text-slate-500">민감정보를 제거하고 운영 검토를 마친 전체 공개 내용을 표시합니다.</p></div><button type="button" onClick={onOpenPublicReports} className="flex flex-none items-center gap-1 text-xs font-black text-[#1e3a5f]">전체 보기 <ArrowRight size={14} /></button></div><div className="mt-4 space-y-2">{publicReportsLoading ? <p className="py-8 text-center text-sm text-slate-400">공개 제보를 불러오는 중입니다.</p> : publicReports.length > 0 ? publicReports.map((report) => <button key={report.id} type="button" onClick={() => onOpenMap()} className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><span className="text-[10px] font-black text-emerald-700">{report.sourceLabel}</span><p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-800">{report.publicDescription}</p><p className="mt-1 text-xs text-slate-500">{report.publicLocationText} · {formatDate(report.occurredAt)}</p></button>) : <div className="py-8 text-center"><ShieldCheck className="mx-auto text-slate-300" size={24} /><p className="mt-2 text-sm text-slate-400">현재 공개된 검토 완료 제보가 없습니다.</p></div>}</div></DashboardSectionSurface>
          <DashboardSectionSurface id="dashboard-own-reports" label="내 제보 상태" moduleId="own-reports" className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">내 제보 상태</h2><p className="mt-1 text-xs text-slate-500">접수·검토·추가정보 요청 상태를 확인합니다.</p></div><ClipboardCheck className="text-[#1e3a5f]" size={21} /></div>{!currentUser ? <div className="py-9 text-center"><p className="text-sm text-slate-500">로그인하면 제출한 제보의 처리 상태를 확인할 수 있습니다.</p><button type="button" onClick={onOpenLogin} className="mt-4 rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-black text-white">로그인</button></div> : ownReportsLoading ? <p className="py-9 text-center text-sm text-slate-400">내 제보를 확인하는 중입니다.</p> : ownReports.length > 0 ? <div className="mt-4 space-y-2">{ownReports.map((report) => <button key={report.reportId} type="button" onClick={onOpenMyReports} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left"><span className="flex-1"><strong className="block text-sm text-slate-800">{report.receiptNumber}</strong><span className="mt-1 block text-xs text-slate-500">{report.locationLabel}</span></span><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-black text-[#1e3a5f]">{report.displayStatus}</span></button>)}</div> : <div className="py-9 text-center"><p className="text-sm text-slate-500">아직 제출한 제보가 없습니다.</p><button type="button" onClick={onOpenReport} className="mt-4 text-xs font-black text-[#d94841]">첫 제보 작성하기</button></div>}</DashboardSectionSurface>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2" aria-label="지역과 뉴스 요약">
          <DashboardSectionSurface id="dashboard-region" label="지역 요약 통계" moduleId="region-summary" style={moduleStyle('region-summary')} className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">지역 요약 통계</h2><p className="mt-1 text-xs text-slate-500">현재 진행 중인 공식 사건 기준입니다.</p></div><button type="button" onClick={onOpenStatistics} className="text-xs font-black text-[#1e3a5f]">상세 통계</button></div><div className="mt-5 space-y-3">{regionStats.slice(0, 6).map((item, index) => <button key={item.region} type="button" onClick={() => onOpenRegion(item.region)} className="block w-full text-left"><div className="mb-1 flex justify-between text-xs font-bold"><span>{String(index + 1).padStart(2, '0')} · {item.region}</span><span>{item.count}명</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#1e3a5f]" style={{ width: `${Math.max(8, item.count / maxRegionCount * 100)}%` }} /></div></button>)}</div></DashboardSectionSurface>
          <DashboardSectionSurface id="dashboard-news" label="관련 뉴스 요약" moduleId="news" style={moduleStyle('news')} className="px-5 sm:px-6"><NewsSummarySection items={newsItems} loading={newsLoading} error={newsError} onRetry={onRetryNews} onOpenAll={() => onOpenNews()} onOpenArticle={(articleId) => onOpenNews(articleId)} /></DashboardSectionSurface>
        </section>

        <section className="my-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]" aria-label="소통과 안전 안내"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><MessageCircle className="text-[#1e3a5f]" /><div><h2 className="font-black text-slate-950">커뮤니티 요약</h2><p className="mt-1 text-sm text-slate-500">확인 가능한 목격 정보와 안전한 응원 메시지를 나눕니다.</p></div></div><button type="button" onClick={() => onOpenCommunity()} className="mt-5 flex items-center gap-1 text-sm font-black text-[#1e3a5f]">소통 공간 보기 <ArrowRight size={15} /></button></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><Info className="text-amber-700" /><div><h2 className="font-black text-slate-950">안전 안내</h2><p className="mt-1 text-sm leading-6 text-slate-600">직접 추적하거나 접근하지 말고, 긴급 상황은 112에 신고하세요. 정확한 최신 정보는 경찰청 공식 채널에서 재확인합니다.</p></div></div></div></section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-7 text-xs text-slate-500 md:pb-7"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:px-2 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2 font-bold text-slate-700"><Siren size={16} className="text-[#1e3a5f]" /> 실종자 안전정보</span><span>긴급신고 112 · 경찰민원 182 · 개인정보 보호</span></div></footer>
      {!hideLegacyMobileNav && <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] md:hidden" aria-label="모바일 빠른 메뉴"><button onClick={goTop} className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#1e3a5f]"><Home size={19} />홈</button><button onClick={focusSearch} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><Search size={19} />검색</button><button onClick={() => onOpenMap()} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><MapIcon size={19} />지도</button><button onClick={() => onOpenCommunity()} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><MessageCircle size={19} />소통</button><button onClick={currentUser ? onOpenProfile : onOpenLogin} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><UserCircle size={19} />내 정보</button></nav>}
    </div>
  );
}
