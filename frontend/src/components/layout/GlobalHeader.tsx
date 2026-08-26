import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BarChart3,
  Activity,
  Bell,
  ChevronDown,
  Database,
  FileText,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu,
  MessageCircle,
  Newspaper,
  Plus,
  Search,
  Shield,
  Siren,
  UserCircle,
  X,
} from 'lucide-react';
import type { AppView } from '../../app-routing/route-contract';

export interface GlobalHeaderProps {
  activeView: AppView;
  currentUser: User | null;
  isAdmin: boolean;
  onNavigate: (view: AppView) => void;
  onReport: () => void;
  onLogin: () => void;
  onLogout: () => void | Promise<void>;
}

type OpenMenu = 'more' | 'account' | 'mobile' | null;

const PRIMARY_ITEMS: Array<{ id: AppView; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: '현황', icon: <Siren size={17} /> },
  { id: 'search', label: '통합 검색', icon: <Search size={17} /> },
  { id: 'map', label: '실종자 지도', icon: <MapIcon size={17} /> },
  { id: 'public-reports', label: '사용자 제보', icon: <FileText size={17} /> },
  { id: 'community', label: '소통', icon: <MessageCircle size={17} /> },
  { id: 'news', label: '관련 뉴스', icon: <Newspaper size={17} /> },
];

const isAccountView = (view: AppView) => ['profile', 'reports', 'alerts', 'admin'].includes(view);

export default function GlobalHeader({
  activeView,
  currentUser,
  isAdmin,
  onNavigate,
  onReport,
  onLogin,
  onLogout,
}: GlobalHeaderProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeMenu = (restoreFocus = false) => {
    setOpenMenu(null);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!openMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [openMenu]);

  useEffect(() => setOpenMenu(null), [activeView]);

  const navigate = (view: AppView) => {
    onNavigate(view);
    closeMenu();
  };

  const toggle = (menu: Exclude<OpenMenu, null>, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setOpenMenu((current) => current === menu ? null : menu);
  };

  const accountItems = currentUser ? (
    <>
      <button type="button" onClick={() => navigate('profile')} aria-current={activeView === 'profile' ? 'page' : undefined}><UserCircle size={16} />내 정보</button>
      <button type="button" onClick={() => navigate('reports')} aria-current={activeView === 'reports' ? 'page' : undefined}><FileText size={16} />내 제보</button>
      <button type="button" onClick={() => navigate('alerts')} aria-current={activeView === 'alerts' ? 'page' : undefined}><Bell size={16} />관심 알림</button>
      {isAdmin && <button type="button" onClick={() => navigate('admin')} aria-current={activeView === 'admin' ? 'page' : undefined}><Shield size={16} />관리자</button>}
      <button type="button" onClick={() => { closeMenu(); void onLogout(); }}><LogOut size={16} />로그아웃</button>
    </>
  ) : (
    <button type="button" onClick={() => { closeMenu(); onLogin(); }}><LogIn size={16} />로그인</button>
  );

  return (
    <header ref={rootRef} className="c-app-header">
      <div className="c-app-header__inner">
        <button type="button" onClick={() => navigate('dashboard')} className="c-app-header__brand" aria-label="실종자 안전정보 현황으로 이동">
          <span className="c-app-header__brand-mark"><Siren size={20} /></span>
          <span><strong>실종자 안전정보</strong><small>공공 안전 현황판</small></span>
        </button>

        <nav className="c-app-header__primary" aria-label="주요 메뉴">
          {PRIMARY_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
              data-active={activeView === item.id ? 'true' : 'false'}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="c-app-header__actions">
          <div className="c-app-header__menu-wrap">
            <button
              type="button"
              onClick={(event) => toggle('more', event.currentTarget)}
              aria-expanded={openMenu === 'more'}
              aria-haspopup="menu"
              className="c-app-header__secondary-button"
              data-active={activeView === 'statistics' || activeView === 'impact' || activeView === 'about-data' ? 'true' : 'false'}
            >
              더보기 <ChevronDown size={15} />
            </button>
            {openMenu === 'more' && <div className="c-app-header__popover" role="menu"><button type="button" role="menuitem" onClick={() => navigate('statistics')} aria-current={activeView === 'statistics' ? 'page' : undefined}><BarChart3 size={16} />공식 통계</button><button type="button" role="menuitem" onClick={() => navigate('impact')} aria-current={activeView === 'impact' ? 'page' : undefined}><Activity size={16} />공익성과</button><button type="button" role="menuitem" onClick={() => navigate('about-data')} aria-current={activeView === 'about-data' ? 'page' : undefined}><Database size={16} />데이터·방법론</button></div>}
          </div>
          <button type="button" onClick={onReport} className="c-app-header__report-button" data-active={activeView === 'report' ? 'true' : 'false'}><Plus size={16} />제보하기</button>
          {currentUser ? (
            <div className="c-app-header__menu-wrap">
              <button
                type="button"
                onClick={(event) => toggle('account', event.currentTarget)}
                aria-expanded={openMenu === 'account'}
                aria-haspopup="menu"
                className="c-app-header__account-button"
                data-active={isAccountView(activeView) ? 'true' : 'false'}
              >
                <UserCircle size={18} /><span>내 정보</span><ChevronDown size={15} />
              </button>
              {openMenu === 'account' && <div className="c-app-header__popover c-app-header__popover--right" role="menu">{accountItems}</div>}
            </div>
          ) : <button type="button" onClick={onLogin} className="c-app-header__login-button"><LogIn size={16} />로그인</button>}
        </div>

        <button
          type="button"
          onClick={(event) => toggle('mobile', event.currentTarget)}
          aria-expanded={openMenu === 'mobile'}
          aria-controls="global-mobile-menu"
          className="c-app-header__mobile-toggle"
          aria-label={openMenu === 'mobile' ? '메뉴 닫기' : '메뉴 열기'}
        >
          {openMenu === 'mobile' ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      {openMenu === 'mobile' && (
        <div id="global-mobile-menu" className="c-app-header__mobile-menu">
          <nav aria-label="모바일 전체 메뉴">
            {PRIMARY_ITEMS.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={activeView === item.id ? 'page' : undefined} data-active={activeView === item.id ? 'true' : 'false'}>{item.icon}{item.label}</button>)}
            <button type="button" onClick={() => navigate('statistics')} aria-current={activeView === 'statistics' ? 'page' : undefined} data-active={activeView === 'statistics' ? 'true' : 'false'}><BarChart3 size={17} />공식 통계</button>
            <button type="button" onClick={() => navigate('impact')} aria-current={activeView === 'impact' ? 'page' : undefined} data-active={activeView === 'impact' ? 'true' : 'false'}><Activity size={17} />공익성과</button>
            <button type="button" onClick={() => navigate('about-data')} aria-current={activeView === 'about-data' ? 'page' : undefined} data-active={activeView === 'about-data' ? 'true' : 'false'}><Database size={17} />데이터·방법론</button>
            <button type="button" onClick={() => { closeMenu(); onReport(); }} data-accent="true"><Plus size={17} />제보하기</button>
          </nav>
          <div className="c-app-header__mobile-account">{accountItems}</div>
        </div>
      )}
    </header>
  );
}
