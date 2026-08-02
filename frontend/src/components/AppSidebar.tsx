import React, { useState } from 'react';
import {
  BarChart3,
  FileText,
  Grid3X3,
  Home,
  Map,
  Menu,
  MessageCircle,
  Shield,
  UserCircle,
  X,
} from 'lucide-react';

export type AppSection = 'dashboard' | 'map' | 'community' | 'statistics' | 'reports' | 'profile' | 'admin' | 'grid';

interface AppSidebarProps {
  activeSection: AppSection;
  currentUser: boolean;
  isAdmin: boolean;
  onNavigate: (section: AppSection) => void;
  onLogin: () => void;
}

const primaryItems: Array<{ id: AppSection; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: '현황 대시보드', icon: <Home size={18} /> },
  { id: 'map', label: '실종자 지도', icon: <Map size={18} /> },
  { id: 'community', label: '소통 피드', icon: <MessageCircle size={18} /> },
  { id: 'statistics', label: '지역 통계', icon: <BarChart3 size={18} /> },
  { id: 'reports', label: '내 제보', icon: <FileText size={18} /> },
  { id: 'profile', label: '내 정보', icon: <UserCircle size={18} /> },
];

export default function AppSidebar({ activeSection, currentUser, isAdmin, onNavigate, onLogin }: AppSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = isAdmin
    ? [...primaryItems, { id: 'admin' as AppSection, label: '관리자', icon: <Shield size={18} /> }]
    : primaryItems;

  const handleNavigate = (section: AppSection) => {
    if ((section === 'reports' || section === 'profile') && !currentUser) {
      onLogin();
      setMobileOpen(false);
      return;
    }
    onNavigate(section);
    setMobileOpen(false);
  };

  const navigation = (
    <nav className="space-y-1" aria-label="주요 메뉴">
      {items.map((item) => {
        const active = activeSection === item.id || (item.id === 'admin' && activeSection === 'admin');
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavigate(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${
              active
                ? 'bg-[#10213a] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'admin' && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">ADMIN</span>}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => handleNavigate('grid')}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${
          activeSection === 'grid' ? 'bg-slate-200 text-slate-950' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Grid3X3 size={18} />
        <span>실종자 그리드</span>
      </button>
    </nav>
  );

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
          aria-label="사이드바 메뉴 열기"
        >
          <Menu size={18} /> 메뉴
        </button>
      </div>

      <aside className="hidden w-64 flex-none border-r border-slate-200 bg-white p-4 md:block" aria-label="사이드바">
        <div className="mb-6 border-b border-slate-100 px-2 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d94841]">MISSING PERSON</p>
          <p className="mt-2 text-lg font-black tracking-tight text-slate-950">실종자 안전정보</p>
        </div>
        {navigation}
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="사이드바 닫기"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-50 bg-slate-950/40 md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-[60] w-72 bg-white p-4 shadow-2xl md:hidden" aria-label="모바일 사이드바">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 px-2 pb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d94841]">MISSING PERSON</p>
                <p className="mt-2 text-lg font-black text-slate-950">실종자 안전정보</p>
              </div>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="사이드바 닫기">
                <X size={20} />
              </button>
            </div>
            {navigation}
          </aside>
        </>
      )}
    </>
  );
}
