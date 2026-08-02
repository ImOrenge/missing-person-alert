import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  FileText,
  Grid3X3,
  Home,
  Info,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Menu,
  Plus,
  Search,
  Shield,
  Siren,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import type { Announcement } from '../types/announcement';
import type { MissingPerson, MissingPersonType } from '../types';
import DashboardMiniMap from './DashboardMiniMap';

interface DashboardHomeProps {
  persons: MissingPerson[];
  announcements: Announcement[];
  currentUser: User | null;
  isAdmin: boolean;
  statsUpdatedLabel?: string;
  pushStatus: string;
  onOpenMap: (personId?: string) => void;
  onOpenCommunity: (personId?: string) => void;
  onOpenRegion: (region: string) => void;
  onOpenStatistics: () => void;
  onOpenGrid: () => void;
  onOpenReport: () => void;
  onOpenMyReports: () => void;
  onOpenLogin: () => void;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void | Promise<void>;
  onEnablePush: () => void | Promise<void>;
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

type BannerAction = 'map' | 'search' | 'statistics' | 'report';

interface BannerSlide {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
  action: BannerAction;
  actionLabel: string;
}

const BANNER_SLIDES: BannerSlide[] = [
  {
    image: '/banner/dashboard-01-overview.png',
    eyebrow: '실종자 안전정보',
    title: '실종자 현황을\n한눈에 확인하세요',
    description: '최근 등록된 정보를 지도와 목록으로 빠르게 확인할 수 있습니다.',
    action: 'map',
    actionLabel: '지도에서 확인하기',
  },
  {
    image: '/banner/dashboard-02-recent-alert.png',
    eyebrow: '최근 등록 정보',
    title: '최근 등록된 실종자부터\n확인해 주세요',
    description: '24시간 내 등록된 정보와 주변의 인상착의를 살펴보세요.',
    action: 'search',
    actionLabel: '최근 정보 검색하기',
  },
  {
    image: '/banner/dashboard-03-regional-map.png',
    eyebrow: '지역별 현황',
    title: '내 주변의 실종 정보를\n확인하세요',
    description: '지역별 현황을 확인하고 지도에서 위치를 살펴볼 수 있습니다.',
    action: 'statistics',
    actionLabel: '지역 통계 보기',
  },
  {
    image: '/banner/dashboard-04-report-guide.png',
    eyebrow: '시민 제보 안내',
    title: '작은 제보가 가족을 만나는\n단서가 됩니다',
    description: '확실하지 않아도 괜찮습니다. 시간과 장소를 알려주세요.',
    action: 'report',
    actionLabel: '온라인 제보하기',
  },
];

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
  persons, announcements, currentUser, isAdmin, statsUpdatedLabel, pushStatus,
  onOpenMap, onOpenCommunity, onOpenRegion, onOpenStatistics, onOpenGrid, onOpenReport,
  onOpenMyReports, onOpenLogin, onOpenProfile, onOpenAdmin, onLogout, onEnablePush,
}: DashboardHomeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);
  const [selectedMapPersonId, setSelectedMapPersonId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = Date.now();

  const activePersons = useMemo(() => persons.filter((person) => person.status !== 'found'), [persons]);
  const recentPersons = useMemo(() => {
    const recent = activePersons.filter((person) => getTimestamp(person) >= now - 7 * DAY_MS);
    return (recent.length > 0 ? recent : activePersons).sort((a, b) => getTimestamp(b) - getTimestamp(a));
  }, [activePersons, now]);
  const urgentCount = useMemo(() => activePersons.filter((person) => getTimestamp(person) >= now - DAY_MS).length, [activePersons, now]);
  const foundCount = useMemo(() => persons.filter((person) => person.status === 'found').length, [persons]);
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
  const visibleAnnouncements = useMemo(() => {
    const unique = new Map<string, Announcement>();
    announcements.forEach((announcement) => unique.set(announcement.id, announcement));
    return Array.from(unique.values()).filter((item) => item.active).sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [announcements]);
  const miniMapPersons = useMemo(() => recentPersons.slice(0, 80), [recentPersons]);
  const maxRegionCount = Math.max(1, ...regionStats.slice(0, 6).map((item) => item.count));
  const pushEnabled = pushStatus === 'enabled';

  useEffect(() => {
    if (bannerPaused) return undefined;
    const timer = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % BANNER_SLIDES.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [bannerPaused]);

  const goTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  const focusSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchRef.current?.focus();
  };

  const handleBannerAction = (action: BannerAction) => {
    if (action === 'map') onOpenMap();
    if (action === 'search') focusSearch();
    if (action === 'statistics') onOpenStatistics();
    if (action === 'report') onOpenReport();
  };

  const selectMiniMapPerson = (personId: string) => {
    setSelectedMapPersonId(personId);
    document.getElementById('dashboard-mini-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const activeBanner = BANNER_SLIDES[bannerIndex];

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-[#f8fafc] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={goTop} className="flex items-center gap-3 text-left" aria-label="현황 대시보드 맨 위로 이동">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e3a5f] text-white"><Siren size={20} /></span>
            <span><strong className="block text-sm font-extrabold tracking-tight text-slate-950 sm:text-base">실종자 안전정보</strong><span className="hidden text-[11px] text-slate-500 sm:block">공공 안전 현황판</span></span>
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="주요 메뉴">
            <button className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-[#1e3a5f]">현황</button>
            <button onClick={() => onOpenMap()} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">실종자 지도</button>
            <button onClick={() => onOpenCommunity()} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">소통</button>
            <button onClick={onOpenStatistics} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">지역 통계</button>
            <button onClick={onOpenReport} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">제보하기</button>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {currentUser ? <>
              <button onClick={onOpenMyReports} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">내 제보</button>
              {isAdmin && <button onClick={onOpenAdmin} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50" aria-label="관리자 대시보드"><Shield size={19} /></button>}
              <button onClick={onOpenProfile} className="flex max-w-48 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:border-slate-300"><UserCircle size={18} /><span className="truncate">{currentUser.displayName || currentUser.email}</span></button>
              <button onClick={onLogout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="로그아웃"><LogOut size={18} /></button>
            </> : <button onClick={onOpenLogin} className="flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#162f4e]"><LogIn size={17} /> 로그인</button>}
          </div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden" aria-label="메뉴 열기" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-lg md:hidden"><div className="grid grid-cols-2 gap-2">
          <button onClick={() => { onOpenMap(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm font-bold"><MapIcon size={17} /> 실종자 지도</button>
          <button onClick={() => { onOpenCommunity(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm font-bold"><MessageCircle size={17} /> 소통</button>
          <button onClick={() => { onOpenStatistics(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm font-bold"><BarChart3 size={17} /> 지역 통계</button>
          <button onClick={() => { onOpenReport(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-3 text-sm font-bold text-red-700"><Plus size={17} /> 제보하기</button>
          {currentUser ? <button onClick={() => { onOpenMyReports(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm font-bold"><FileText size={17} /> 내 제보</button> : <button onClick={() => { onOpenLogin(); setMobileMenuOpen(false); }} className="flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-3 text-sm font-bold text-white"><LogIn size={17} /> 로그인</button>}
        </div></div>}
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8 lg:pb-12">
        <section className="border-b border-slate-200 py-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-extrabold tracking-[0.16em] text-[#1e3a5f]">LIVE STATUS BOARD</p><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">실종자 현황</h1><p className="mt-2 text-sm text-slate-500">최근 등록된 실종자와 지역별 수색 현황을 확인하세요.</p></div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 실시간 연결됨 <span className="text-slate-300">·</span> 마지막 갱신 {statsUpdatedLabel || '확인 중'}</div>
          </div>
        </section>

        <section className="grid grid-cols-2 border-x border-b border-slate-200 bg-white sm:grid-cols-4">
          {[
            { label: '현재 진행 중', value: activePersons.length, note: '수색·조사 중', icon: Users, color: 'text-[#1e3a5f]' },
            { label: '24시간 내 등록', value: urgentCount, note: '빠른 확인 필요', icon: Siren, color: 'text-[#d94841]' },
            { label: '발견 완료', value: foundCount, note: '누적 상태 기준', icon: CheckCircle2, color: 'text-emerald-700' },
            { label: '등록 지역', value: regionStats.length, note: '현재 진행 기준', icon: MapPin, color: 'text-blue-700' },
          ].map((metric, index) => { const Icon = metric.icon; return <div key={metric.label} className={`border-slate-200 p-4 sm:p-5 ${index % 2 === 1 ? 'border-l' : ''} ${index > 1 ? 'border-t sm:border-t-0' : ''} ${index > 0 ? 'sm:border-l' : ''}`}><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Icon size={16} className={metric.color} /> {metric.label}</div><p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{metric.value.toLocaleString()}<span className="ml-1 text-sm font-bold text-slate-400">{metric.label === '등록 지역' ? '곳' : metric.label === '발견 완료' || metric.label === '현재 진행 중' ? '명' : '건'}</span></p><p className="mt-1 text-[11px] text-slate-400">{metric.note}</p></div>; })}
        </section>

        <section
          className="relative mt-6 overflow-hidden rounded-xl bg-[#17202e] shadow-sm sm:mt-8"
          onMouseEnter={() => setBannerPaused(true)}
          onMouseLeave={() => setBannerPaused(false)}
          onFocusCapture={() => setBannerPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBannerPaused(false);
          }}
          aria-label="실종자 안전정보 안내 배너"
        >
          <div className="relative w-full aspect-[16/8] min-h-[280px] sm:aspect-[16/6] sm:min-h-[300px]">
            {BANNER_SLIDES.map((slide, index) => (
              <img
                key={slide.image}
                src={slide.image}
                alt=""
                aria-hidden={index !== bannerIndex}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === bannerIndex ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d192b] via-[#0d192b]/90 to-transparent sm:via-[#0d192b]/75" />
            <div className="relative flex h-full max-w-xl flex-col justify-center px-6 py-8 text-white sm:px-10">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">{activeBanner.eyebrow}</p>
              <h2 className="mt-3 whitespace-pre-line text-2xl font-black leading-tight tracking-tight sm:text-3xl">{activeBanner.title}</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-200">{activeBanner.description}</p>
              <button onClick={() => handleBannerAction(activeBanner.action)} className="mt-5 flex w-fit items-center gap-2 rounded-lg bg-[#d94841] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-black/20 transition hover:bg-[#c23d37] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#17202e]">
                {activeBanner.actionLabel} <ArrowRight size={16} />
              </button>
            </div>
            <div className="absolute bottom-5 right-5 flex items-center gap-2 sm:right-8">
              <button onClick={() => setBannerIndex((current) => (current - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white hover:bg-white/20" aria-label="이전 배너"><ChevronRight className="rotate-180" size={16} /></button>
              <div className="flex items-center gap-1.5" role="tablist" aria-label="배너 슬라이드 선택">{BANNER_SLIDES.map((slide, index) => <button key={slide.image} onClick={() => setBannerIndex(index)} role="tab" aria-selected={index === bannerIndex} aria-label={`${index + 1}번 배너`} className={`h-1.5 rounded-full transition-all ${index === bannerIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />)}</div>
              <button onClick={() => setBannerIndex((current) => (current + 1) % BANNER_SLIDES.length)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white hover:bg-white/20" aria-label="다음 배너"><ChevronRight size={16} /></button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 border-b border-slate-200 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-10">
          <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">최근 실종자</h2><p className="mt-1 text-sm text-slate-500">최근 7일 기준 · 총 {recentPersons.length.toLocaleString()}건 이상</p></div><button onClick={onOpenGrid} className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Grid3X3 size={15} /> 전체 목록</button></div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="이름·지역·인상착의 검색" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1e3a5f] focus:ring-2 focus:ring-blue-100" /></label><div className="flex gap-2 overflow-x-auto"><button onClick={() => setSelectedRegion('전체')} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${selectedRegion === '전체' ? 'bg-[#1e3a5f] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>전체</button>{regionStats.slice(0, 3).map((item) => <button key={item.region} onClick={() => setSelectedRegion(item.region)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${selectedRegion === item.region ? 'bg-[#1e3a5f] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item.region}</button>)}</div></div>
            <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {visiblePersons.length > 0 ? visiblePersons.map((person) => { const urgent = getTimestamp(person) >= now - DAY_MS; return <button key={person.id} onClick={() => selectMiniMapPerson(person.id)} aria-label={`${person.name} 위치를 미니지도에서 보기`} className="group flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-50 sm:gap-4 sm:p-4"><div className="h-16 w-16 flex-none overflow-hidden rounded-lg bg-slate-100 sm:h-[72px] sm:w-[72px]"><PersonPhoto person={person} compact /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-extrabold text-slate-950 group-hover:text-[#1e3a5f]">{person.name}</h3>{urgent && <span className="flex-none rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-[#d94841]">24H</span>}</div><p className="mt-1 text-xs text-slate-500">{person.age ? `${person.age}세` : '나이 미상'} · {genderLabel(person.gender)} · {TYPE_LABELS[person.type]}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin size={13} className="flex-none text-slate-400" /> {person.location.address}</p></div><div className="hidden text-right sm:block"><p className="text-xs font-bold text-slate-700">{formatDate(person.missingDate)}</p><p className="mt-1 text-[11px] text-slate-400">{elapsed(person.missingDate)}</p></div><ChevronRight className="flex-none text-slate-300 group-hover:text-[#1e3a5f]" size={18} /></button>; }) : <div className="py-12 text-center text-sm text-slate-400"><Search className="mx-auto mb-2 text-slate-300" size={28} />검색 결과가 없습니다.<button onClick={() => { setSearchQuery(''); setSelectedRegion('전체'); }} className="ml-2 font-bold text-[#1e3a5f]">초기화</button></div>}
            </div>
          </div>

          <div id="dashboard-mini-map" className="min-w-0"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-950">전국 실종자 지도</h2><p className="mt-1 text-sm text-slate-500">실종자를 선택하면 위치 핀이 표시됩니다.</p></div><button onClick={() => onOpenMap(selectedMapPersonId || undefined)} className="text-xs font-bold text-[#1e3a5f] hover:underline">전체 지도 <ArrowRight className="inline" size={14} /></button></div><div className="mt-5 h-[300px] sm:h-[360px]"><DashboardMiniMap persons={miniMapPersons} selectedPersonId={selectedMapPersonId} onSelectPerson={setSelectedMapPersonId} onOpenMap={onOpenMap} /></div></div>
        </section>

        <section className="border-b border-slate-200 py-8 lg:py-10" aria-labelledby="missing-person-details-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold tracking-[0.16em] text-[#1e3a5f]">CASE DETAILS</p>
              <h2 id="missing-person-details-title" className="mt-2 text-xl font-black text-slate-950">실종자 상세 정보</h2>
              <p className="mt-1 text-sm text-slate-500">지도에서 확인한 최근 실종자의 사진·상태·위치를 자세히 확인하세요.</p>
            </div>
            <button onClick={onOpenGrid} className="flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">전체 목록 <ArrowRight size={14} /></button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePersons.length > 0 ? visiblePersons.slice(0, 6).map((person) => {
              const urgent = getTimestamp(person) >= now - DAY_MS;
              const selected = selectedMapPersonId === person.id;
              return (
                <button
                  key={`detail-${person.id}`}
                  type="button"
                  onClick={() => selectMiniMapPerson(person.id)}
                  className={`group rounded-xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-[#1e3a5f] ring-2 ring-blue-100' : 'border-slate-200'}`}
                  aria-label={`${person.name} 상세를 지도에서 보기`}
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-20 flex-none overflow-hidden rounded-lg bg-slate-100"><PersonPhoto person={person} compact /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><h3 className="truncate font-extrabold text-slate-950 group-hover:text-[#1e3a5f]">{person.name}</h3><span className={`flex-none rounded px-1.5 py-1 text-[10px] font-black ${urgent ? 'bg-red-50 text-[#d94841]' : 'bg-amber-50 text-amber-700'}`}>{urgent ? '24H' : '수색 중'}</span></div>
                      <p className="mt-1 text-xs text-slate-500">{person.age ? `${person.age}세` : '나이 미상'} · {genderLabel(person.gender)} · {TYPE_LABELS[person.type]}</p>
                      <p className="mt-2 flex items-start gap-1 text-xs leading-5 text-slate-600"><MapPin size={13} className="mt-0.5 flex-none text-[#d94841]" /> <span className="line-clamp-2">{person.location.address}</span></p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <p><span className="font-bold text-slate-700">실종일</span> {formatDate(person.missingDate)} · {elapsed(person.missingDate)}</p>
                    <p className="mt-1 truncate"><span className="font-bold text-slate-700">인상착의</span> {person.clothes || person.description || '등록된 인상착의 정보가 없습니다.'}</p>
                  </div>
                  <p className="mt-3 flex items-center justify-end gap-1 text-xs font-black text-[#1e3a5f]">지도에서 위치 보기 <ArrowRight size={14} /></p>
                </button>
              );
            }) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">표시할 실종자 상세 정보가 없습니다.</div>}
          </div>
        </section>

        <section className="grid gap-6 border-b border-slate-200 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-10">
          <div><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-950">지역별 현황</h2><p className="mt-1 text-sm text-slate-500">현재 진행 중인 정보를 지역별로 집계했습니다.</p></div><button onClick={onOpenStatistics} className="text-xs font-bold text-[#1e3a5f] hover:underline">상세 통계 <ArrowRight className="inline" size={14} /></button></div><div className="mt-5 space-y-4">{regionStats.slice(0, 6).map((item, index) => <button key={item.region} onClick={() => onOpenRegion(item.region)} className="group block w-full text-left"><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold text-slate-700"><span className="mr-2 text-slate-300">{String(index + 1).padStart(2, '0')}</span>{item.region}</span><span className="font-black text-slate-900">{item.count}명</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#1e3a5f] transition-all group-hover:bg-[#d94841]" style={{ width: `${Math.max(8, item.count / maxRegionCount * 100)}%` }} /></div></button>)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Info size={18} className="text-[#1e3a5f]" /><h2 className="font-black text-slate-950">공지사항</h2></div><div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">{visibleAnnouncements.length > 0 ? visibleAnnouncements.map((announcement) => <div key={announcement.id} className="flex items-start gap-3 py-3"><span className={`mt-0.5 rounded px-1.5 py-1 text-[10px] font-black ${announcement.type === 'warning' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{announcement.type === 'warning' ? '중요' : '안내'}</span><p className="flex-1 text-sm leading-5 text-slate-700">{announcement.popupTitle || announcement.text}</p></div>) : <p className="py-8 text-center text-sm text-slate-400">등록된 공지사항이 없습니다.</p>}</div><div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">정확한 최신 정보는 경찰청 공식 채널과 112 신고를 통해 다시 확인해 주세요.</div></div>
        </section>

        <section className="grid gap-4 py-8 sm:grid-cols-2"><div className="flex items-start gap-4 rounded-xl border border-red-100 bg-red-50 p-5"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white text-[#d94841]"><Plus size={21} /></span><div className="min-w-0"><h2 className="font-black text-slate-950">목격 정보를 알려주세요</h2><p className="mt-1 text-sm leading-5 text-slate-600">확실하지 않아도 괜찮습니다. 시간과 장소를 남겨주세요.</p><button onClick={onOpenReport} className="mt-3 text-sm font-black text-[#d94841] hover:underline">온라인 제보하기 <ArrowRight className="inline" size={14} /></button></div></div><div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-slate-100 text-[#1e3a5f]"><Bell size={20} /></span><div className="min-w-0"><h2 className="font-black text-slate-950">관심 지역 알림</h2><p className="mt-1 text-sm leading-5 text-slate-600">새 실종 정보가 등록되면 푸시로 알려드립니다.</p>{pushEnabled ? <p className="mt-3 flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 size={15} /> 알림이 켜져 있습니다</p> : <button onClick={currentUser ? onEnablePush : onOpenLogin} className="mt-3 text-sm font-black text-[#1e3a5f] hover:underline">{currentUser ? '알림 켜기' : '로그인하고 알림 받기'} <ArrowRight className="inline" size={14} /></button>}</div></div></section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-7 text-xs text-slate-500 md:pb-7"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:px-2 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2 font-bold text-slate-700"><Siren size={16} className="text-[#1e3a5f]" /> 실종자 안전정보</span><span>긴급신고 112 · 경찰민원 182 · 개인정보 보호</span></div></footer>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] md:hidden" aria-label="모바일 빠른 메뉴"><button onClick={goTop} className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#1e3a5f]"><Home size={19} />홈</button><button onClick={focusSearch} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><Search size={19} />검색</button><button onClick={() => onOpenMap()} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><MapIcon size={19} />지도</button><button onClick={() => onOpenCommunity()} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><MessageCircle size={19} />소통</button><button onClick={currentUser ? onOpenProfile : onOpenLogin} className="flex flex-col items-center gap-1 text-[10px] font-bold text-slate-500"><UserCircle size={19} />내 정보</button></nav>
    </div>
  );
}
