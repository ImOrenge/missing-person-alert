import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle, Heart, MessageCircle, AtSign } from 'lucide-react';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/firebase';
import {
  CommentNotificationModel,
  subscribeCommentNotifications,
  markAllNotificationsRead
} from '../services/notificationService';

const typeLabels: Record<string, { icon: React.ReactNode; text: (notification: CommentNotificationModel) => string }> = {
  like: {
    icon: <Heart size={14} color="#e74c3c" />,
    text: () => '댓글에 공감이 추가되었습니다'
  },
  reply: {
    icon: <MessageCircle size={14} color="#3498db" />,
    text: () => '내 댓글에 새로운 답글이 달렸습니다'
  },
  mention: {
    icon: <AtSign size={14} color="#9b59b6" />,
    text: () => '댓글에서 언급되었습니다'
  }
};

const NotificationBell: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<CommentNotificationModel[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange(user => setCurrentUser(user));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    const unsubscribe = subscribeCommentNotifications(currentUser.uid, setNotifications);
    return unsubscribe;
  }, [currentUser]);

  const unreadCount = useMemo(() => notifications.filter(notification => !notification.isRead).length, [notifications]);

  const togglePanel = async () => {
    if (!currentUser) {
      setIsPanelOpen(false);
      return;
    }
    const nextState = !isPanelOpen;
    setIsPanelOpen(nextState);
    if (nextState) {
      await markAllNotificationsRead(notifications).catch(() => undefined);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={togglePanel}
        style={{
          position: 'relative',
          padding: '10px',
          borderRadius: '50%',
          backgroundColor: isPanelOpen ? '#c0392b' : 'rgba(255,255,255,0.12)',
          border: 'none',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              minWidth: '18px',
              height: '18px',
              borderRadius: '999px',
              backgroundColor: '#e74c3c',
              color: 'white',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              fontWeight: 600
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isPanelOpen && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            width: '320px',
            maxHeight: '360px',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            border: '1px solid rgba(231, 76, 60, 0.1)',
            zIndex: 1000
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} color="#e74c3c" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#2c3e50' }}>댓글 알림</span>
            </div>
            {unreadCount > 0 && (
              <span style={{ fontSize: '11px', color: '#e74c3c' }}>{unreadCount}건 읽지 않음</span>
            )}
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#95a5a6', fontSize: '13px' }}>
                아직 도착한 알림이 없습니다.
              </div>
            ) : (
              notifications.map(notification => {
                const meta = typeLabels[notification.type] || typeLabels['mention'];
                const isRead = notification.isRead;

                return (
                  <div
                    key={notification.notificationId}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f5f5f5',
                      backgroundColor: isRead ? 'white' : 'rgba(231, 76, 60, 0.08)',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start'
                    }}
                  >
                    <div style={{ marginTop: '2px' }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#2c3e50' }}>{meta.text(notification)}</p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#95a5a6' }}>
                        {notification.createdAtDate.toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
