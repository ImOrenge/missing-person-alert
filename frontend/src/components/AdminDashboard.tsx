import React, { useState } from 'react';
import { X, Shield, Users, BarChart3, FileText, Bell, AlertTriangle } from 'lucide-react';
import AllReportsTab from './AdminDashboard/AllReportsTab';
import UserManagementTab from './AdminDashboard/UserManagementTab';
import StatisticsTab from './AdminDashboard/StatisticsTab';
import AnnouncementsTab from './AdminDashboard/AnnouncementsTab';
import CommentReportsTab from './AdminDashboard/CommentReportsTab';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'reports' | 'users' | 'statistics' | 'announcements' | 'commentReports';

export default function AdminDashboard({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('reports');

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: 0,
          maxWidth: '1200px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
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
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '20px 30px 0 30px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <TabButton
            active={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
            icon={<FileText size={18} />}
            label="제보 조회"
          />
          <TabButton
            active={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            icon={<Users size={18} />}
            label="유저 관리"
          />
          <TabButton
            active={activeTab === 'statistics'}
            onClick={() => setActiveTab('statistics')}
            icon={<BarChart3 size={18} />}
            label="통계"
          />
          <TabButton
            active={activeTab === 'announcements'}
            onClick={() => setActiveTab('announcements')}
            icon={<Bell size={18} />}
            label="공지사항"
          />
          <TabButton
            active={activeTab === 'commentReports'}
            onClick={() => setActiveTab('commentReports')}
            icon={<AlertTriangle size={18} />}
            label="댓글 신고"
          />
        </div>

        {/* 탭 콘텐츠 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 30px 30px 30px',
          backgroundColor: '#fafafa'
        }}>
          {activeTab === 'reports' && <AllReportsTab />}
          {activeTab === 'users' && <UserManagementTab />}
          {activeTab === 'statistics' && <StatisticsTab />}
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
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
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
        borderBottom: active ? 'none' : '1px solid transparent'
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
