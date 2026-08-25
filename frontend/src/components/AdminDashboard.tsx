import React, { useState } from 'react';
import { X, Shield, Users, BarChart3, Bell, AlertTriangle, Search } from 'lucide-react';
import UserManagementTab from './AdminDashboard/UserManagementTab';
import StatisticsTab from './AdminDashboard/StatisticsTab';
import AnnouncementsTab from './AdminDashboard/AnnouncementsTab';
import CommentReportsTab from './AdminDashboard/CommentReportsTab';
import SeoMetricsTab from '../features/admin/seo/SeoMetricsTab';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isPage?: boolean;
}

type TabType = 'users' | 'statistics' | 'seoMetrics' | 'announcements' | 'commentReports';

export default function AdminDashboard({ isOpen, onClose, isPage = false }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('users');

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: isPage ? 'static' : 'fixed',
        top: isPage ? undefined : 0,
        left: isPage ? undefined : 0,
        right: isPage ? undefined : 0,
        bottom: isPage ? undefined : 0,
        backgroundColor: isPage ? 'transparent' : 'rgba(0, 0, 0, 0.7)',
        display: isPage ? 'block' : 'flex',
        alignItems: isPage ? undefined : 'center',
        justifyContent: isPage ? undefined : 'center',
        zIndex: isPage ? undefined : 2000,
        padding: isPage ? 0 : '20px'
      }}
      onClick={isPage ? undefined : onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: isPage ? '16px' : '12px',
          padding: 0,
          maxWidth: isPage ? 'none' : '1200px',
          width: '100%',
          maxHeight: isPage ? undefined : '90vh',
          overflow: isPage ? 'visible' : 'hidden',
          boxShadow: isPage ? '0 1px 3px rgba(15,23,42,0.08)' : '0 10px 40px rgba(0,0,0,0.3)',
          border: isPage ? '1px solid #e2e8f0' : undefined,
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          padding: '24px 30px',
          borderBottom: '2px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={32} color="#e74c3c" />
            <div>
              <h2 style={{ margin: 0, fontSize: '26px', color: '#2c3e50', fontWeight: 'bold' }}>
                관리자 대시보드
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7f8c8d' }}>
                실종자 시스템 관리 콘솔
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="관리자 대시보드 닫기"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#95a5a6',
              padding: '8px',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div role="tablist" aria-label="관리자 대시보드 메뉴" style={{
          display: 'flex',
          gap: '4px',
          padding: '20px 30px 0 30px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e0e0e0',
          overflowX: 'auto'
        }}>
          <TabButton
            tabId="users"
            active={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            icon={<Users size={18} />}
            label="유저 관리"
          />
          <TabButton
            tabId="statistics"
            active={activeTab === 'statistics'}
            onClick={() => setActiveTab('statistics')}
            icon={<BarChart3 size={18} />}
            label="통계"
          />
          <TabButton
            tabId="seoMetrics"
            active={activeTab === 'seoMetrics'}
            onClick={() => setActiveTab('seoMetrics')}
            icon={<Search size={18} />}
            label="검색 전환"
          />
          <TabButton
            tabId="announcements"
            active={activeTab === 'announcements'}
            onClick={() => setActiveTab('announcements')}
            icon={<Bell size={18} />}
            label="공지사항"
          />
          <TabButton
            tabId="commentReports"
            active={activeTab === 'commentReports'}
            onClick={() => setActiveTab('commentReports')}
            icon={<AlertTriangle size={18} />}
            label="댓글 신고"
          />
        </div>

        {/* 탭 콘텐츠 */}
        <div
          id={`admin-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`admin-tab-${activeTab}`}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 30px 30px 30px',
            backgroundColor: '#fafafa'
          }}
        >
          {activeTab === 'users' && <UserManagementTab />}
          {activeTab === 'statistics' && <StatisticsTab />}
          {activeTab === 'seoMetrics' && <SeoMetricsTab />}
          {activeTab === 'announcements' && <AnnouncementsTab />}
          {activeTab === 'commentReports' && <CommentReportsTab />}
        </div>
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tabId: TabType;
}

function TabButton({ active, onClick, icon, label, tabId }: TabButtonProps) {
  return (
    <button
      id={`admin-tab-${tabId}`}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`admin-panel-${tabId}`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px',
        backgroundColor: active ? '#3498db' : 'transparent',
        color: active ? 'white' : '#7f8c8d',
        border: 'none',
        borderRadius: '8px 8px 0 0',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: active ? 'bold' : 'normal',
        transition: 'all 0.2s',
        borderBottom: active ? 'none' : '1px solid transparent',
        flexShrink: 0
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#f0f0f0';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
