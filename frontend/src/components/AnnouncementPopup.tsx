import React, { useState, useEffect } from 'react';
import { X, Info, AlertTriangle } from 'lucide-react';
import type { Announcement } from '../types/announcement';

interface Props {
  announcements: Announcement[];
  onClose: () => void;
}

const STORAGE_KEY_PREFIX = 'announcement_popup_dismissed_';

export default function AnnouncementPopup({ announcements, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // localStorage에서 오늘 날짜 내에 닫은 공지 목록 불러오기
  useEffect(() => {
    const dismissed = new Set<string>();
    const today = new Date().toDateString();

    announcements.forEach(announcement => {
      const storageKey = `${STORAGE_KEY_PREFIX}${announcement.id}`;
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        try {
          const data = JSON.parse(stored);
          // 같은 날짜에 닫았으면 다시 표시하지 않음
          if (data.date === today) {
            dismissed.add(announcement.id);
          } else {
            // 날짜가 바뀌었으면 삭제
            localStorage.removeItem(storageKey);
          }
        } catch (e) {
          localStorage.removeItem(storageKey);
        }
      }
    });

    setDismissedIds(dismissed);
  }, [announcements]);

  // 아직 보지 않은 공지 필터링
  const visibleAnnouncements = announcements.filter(
    announcement => !dismissedIds.has(announcement.id)
  );

  // 모든 공지를 이미 봤으면 닫기
  useEffect(() => {
    if (visibleAnnouncements.length === 0) {
      onClose();
    }
  }, [visibleAnnouncements.length, onClose]);

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  const currentAnnouncement = visibleAnnouncements[currentIndex];
  const isWarning = currentAnnouncement.type === 'warning';

  const handleClose = () => {
    if (currentIndex < visibleAnnouncements.length - 1) {
      // 다음 공지로 이동
      setCurrentIndex(prev => prev + 1);
    } else {
      // 마지막 공지면 팝업 닫기
      onClose();
    }
  };

  const handleDismissToday = () => {
    // localStorage에 오늘 날짜로 저장
    const storageKey = `${STORAGE_KEY_PREFIX}${currentAnnouncement.id}`;
    const today = new Date().toDateString();

    localStorage.setItem(storageKey, JSON.stringify({
      date: today,
      announcementId: currentAnnouncement.id
    }));

    // 닫은 목록에 추가
    setDismissedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(currentAnnouncement.id);
      return newSet;
    });

    handleClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: 0,
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          animation: 'slideIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '24px 24px 20px 24px',
            borderBottom: '2px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isWarning ? '#fff3cd' : '#d1ecf1'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            {isWarning ? (
              <AlertTriangle size={28} color="#856404" />
            ) : (
              <Info size={28} color="#0c5460" />
            )}
            <div style={{ flex: 1 }}>
              <h3 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold',
                color: isWarning ? '#856404' : '#0c5460'
              }}>
                {currentAnnouncement.popupTitle || (isWarning ? '중요 공지' : '알림')}
              </h3>
              {visibleAnnouncements.length > 1 && (
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  {currentIndex + 1} / {visibleAnnouncements.length}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#999',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        {/* 내용 */}
        <div style={{ padding: '32px 24px' }}>
          <p style={{
            margin: 0,
            fontSize: '16px',
            lineHeight: '1.6',
            color: '#2c3e50',
            whiteSpace: 'pre-wrap'
          }}>
            {currentAnnouncement.text}
          </p>
        </div>

        {/* 하단 버튼 */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          backgroundColor: '#f8f9fa'
        }}>
          <button
            onClick={handleDismissToday}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5a6268'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6c757d'}
          >
            오늘 하루 보지 않기
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 24px',
              backgroundColor: isWarning ? '#ffc107' : '#17a2b8',
              color: isWarning ? '#000' : 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isWarning ? '#e0a800' : '#138496';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isWarning ? '#ffc107' : '#17a2b8';
            }}
          >
            {currentAnnouncement.popupButtonText || '확인'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
