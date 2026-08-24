import React from 'react';
import { FilePlus2, Home, Map, Search, UserCircle } from 'lucide-react';
import type { AppView } from '../../app-routing/route-contract';

interface MobileNavigationProps {
  activeView: AppView;
  onHome: () => void;
  onSearch: () => void;
  onMap: () => void;
  onReport: () => void;
  onProfile: () => void;
}

const itemClass = (active: boolean) =>
  `flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
    active ? 'text-[#1e3a5f]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
  }`;

export default function MobileNavigation({ activeView, onHome, onSearch, onMap, onReport, onProfile }: MobileNavigationProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[80] grid grid-cols-5 border-t border-slate-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] md:hidden"
      aria-label="모바일 주요 메뉴"
    >
      <button type="button" onClick={onHome} aria-current={activeView === 'dashboard' ? 'page' : undefined} className={itemClass(activeView === 'dashboard')}><Home size={19} aria-hidden="true" />홈</button>
      <button type="button" onClick={onSearch} aria-current={activeView === 'search' ? 'page' : undefined} className={itemClass(activeView === 'search')}><Search size={19} aria-hidden="true" />검색</button>
      <button type="button" onClick={onMap} aria-current={activeView === 'map' ? 'page' : undefined} className={itemClass(activeView === 'map')}><Map size={19} aria-hidden="true" />지도</button>
      <button type="button" onClick={onReport} aria-current={activeView === 'report' ? 'page' : undefined} className={itemClass(activeView === 'report')}><FilePlus2 size={19} aria-hidden="true" />제보</button>
      <button type="button" onClick={onProfile} aria-current={activeView === 'profile' || activeView === 'reports' || activeView === 'alerts' ? 'page' : undefined} className={itemClass(activeView === 'profile' || activeView === 'reports' || activeView === 'alerts')}><UserCircle size={19} aria-hidden="true" />프로필</button>
    </nav>
  );
}
