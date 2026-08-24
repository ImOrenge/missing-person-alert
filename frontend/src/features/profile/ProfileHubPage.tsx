import React from 'react';
import { Bell, FileText, UserCircle } from 'lucide-react';

export type ProfileHubSection = 'profile' | 'reports' | 'alerts';

interface ProfileHubPageProps {
  activeSection: ProfileHubSection;
  onNavigate: (section: ProfileHubSection) => void;
  children: React.ReactNode;
}

const ITEMS: Array<{
  id: ProfileHubSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { id: 'profile', label: '내 정보', description: '계정·인증·개인화', icon: <UserCircle size={18} /> },
  { id: 'reports', label: '내 제보', description: '접수·검토 상태', icon: <FileText size={18} /> },
  { id: 'alerts', label: '관심 알림', description: '사건·지역·수신 설정', icon: <Bell size={18} /> },
];

export default function ProfileHubPage({ activeSection, onNavigate, children }: ProfileHubPageProps) {
  const selected = ITEMS.find((item) => item.id === activeSection) || ITEMS[0];
  return (
    <div className="f-profile-hub">
      <nav className="f-profile-hub__nav" aria-label="프로필 메뉴">
          {ITEMS.map((item) => {
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : 'false'}
                className="f-profile-hub__nav-item"
              >
                <span className="f-profile-hub__nav-icon">{item.icon}</span>
                <span className="f-profile-hub__nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
      </nav>
      <section className="f-profile-hub__content" aria-labelledby="profile-hub-title">
        <header className="f-profile-hub__content-head">
          <span className="f-profile-hub__content-icon">{selected.icon}</span>
          <div><h2 id="profile-hub-title">{selected.label}</h2><p>{selected.description}</p></div>
        </header>
        <div className="f-profile-hub__content-body">{children}</div>
      </section>
    </div>
  );
}
