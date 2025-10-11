import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Calendar, Shield, AlertCircle, CheckCircle, Edit2, Save } from 'lucide-react';
import { getAuth, updateProfile } from 'firebase/auth';
import { toast } from 'react-toastify';
import { PhoneAuthModal } from './PhoneAuthModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ isOpen, onClose }: Props) {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (currentUser) {
        setUser(currentUser);
        setDisplayName(currentUser.displayName || '');

        // 전화번호 인증 필요 여부 확인
        const hasPhoneNumber = !!currentUser.phoneNumber;
        setNeedsVerification(!hasPhoneNumber);
      }
    }
  }, [isOpen]);

  const handleSaveProfile = async () => {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      toast.error('로그인이 필요합니다');
      return;
    }

    try {
      setIsSaving(true);

      await updateProfile(currentUser, {
        displayName: displayName.trim() || null
      });

      // 사용자 정보 새로고침
      await currentUser.reload();
      setUser(auth.currentUser);

      toast.success('프로필이 업데이트되었습니다');
      setIsEditing(false);
    } catch (error: any) {
      console.error('프로필 업데이트 실패:', error);
      toast.error('프로필 업데이트 중 오류가 발생했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhoneAuthSuccess = () => {
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (currentUser) {
      setUser(currentUser);
      setNeedsVerification(!currentUser.phoneNumber);
    }

    setShowPhoneAuth(false);
    toast.success('전화번호 인증이 완료되었습니다!');
  };

  if (!isOpen || !user) return null;

  const getProviderName = (providerId: string) => {
    switch (providerId) {
      case 'google.com':
        return 'Google';
      case 'facebook.com':
        return 'Facebook';
      case 'twitter.com':
        return 'Twitter';
      case 'github.com':
        return 'GitHub';
      case 'phone':
        return '전화번호';
      case 'password':
        return '이메일/비밀번호';
      default:
        return providerId;
    }
  };

  const providers = user.providerData?.map((p: any) => getProviderName(p.providerId)) || [];

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: showPhoneAuth ? 'none' : 'flex',
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
            padding: '30px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <User size={28} color="#3498db" />
              <h2 style={{ margin: 0, fontSize: '24px', color: '#2c3e50' }}>
                내 프로필
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '28px',
                cursor: 'pointer',
                color: '#95a5a6'
              }}
            >
              <X size={24} />
            </button>
          </div>

          {/* 인증 필요 알림 */}
          {needsVerification && (
            <div style={{
              padding: '16px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'start',
              gap: '12px'
            }}>
              <AlertCircle size={24} color="#856404" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#856404', fontSize: '16px', fontWeight: 'bold' }}>
                  전화번호 인증이 필요합니다
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#856404', lineHeight: '1.5' }}>
                  실종자 제보 기능을 사용하려면 전화번호 인증이 필요합니다.
                  허위 신고 방지 및 제보자 확인을 위해 필수적으로 진행됩니다.
                </p>
                <button
                  onClick={() => setShowPhoneAuth(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#ffc107',
                    color: '#856404',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Phone size={16} />
                  지금 인증하기
                </button>
              </div>
            </div>
          )}

          {/* 프로필 정보 */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#7f8c8d', fontWeight: '600', textTransform: 'uppercase' }}>
              기본 정보
            </h3>

            {/* 이름 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
                이름
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              ) : (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#2c3e50'
                }}>
                  {user.displayName || '이름 없음'}
                </div>
              )}
            </div>

            {/* 이메일 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
                <Mail size={14} style={{ display: 'inline', marginRight: '6px' }} />
                이메일
              </label>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#2c3e50',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{user.email || 'N/A'}</span>
                {user.emailVerified && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#27ae60',
                    backgroundColor: '#e8f5e9',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}>
                    <CheckCircle size={12} />
                    인증됨
                  </span>
                )}
              </div>
            </div>

            {/* 전화번호 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
                <Phone size={14} style={{ display: 'inline', marginRight: '6px' }} />
                전화번호
              </label>
              <div style={{
                padding: '12px',
                backgroundColor: user.phoneNumber ? '#f8f9fa' : '#fff5f5',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#2c3e50',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{user.phoneNumber || '인증되지 않음'}</span>
                {user.phoneNumber ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#27ae60',
                    backgroundColor: '#e8f5e9',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}>
                    <CheckCircle size={12} />
                    인증됨
                  </span>
                ) : (
                  <button
                    onClick={() => setShowPhoneAuth(true)}
                    style={{
                      fontSize: '12px',
                      padding: '6px 12px',
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    인증하기
                  </button>
                )}
              </div>
            </div>

            {/* 가입일 */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
                <Calendar size={14} style={{ display: 'inline', marginRight: '6px' }} />
                가입일
              </label>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#2c3e50'
              }}>
                {user.metadata?.creationTime
                  ? new Date(user.metadata.creationTime).toLocaleString('ko-KR')
                  : 'N/A'}
              </div>
            </div>

            {/* 로그인 방법 */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#7f8c8d', fontWeight: '500' }}>
                <Shield size={14} style={{ display: 'inline', marginRight: '6px' }} />
                로그인 방법
              </label>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#2c3e50'
              }}>
                {providers.length > 0 ? providers.join(', ') : 'N/A'}
              </div>
            </div>
          </div>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setDisplayName(user.displayName || '');
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#ecf0f1',
                    color: '#7f8c8d',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: isSaving ? 0.6 : 1
                  }}
                >
                  <Save size={16} />
                  {isSaving ? '저장 중...' : '저장'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Edit2 size={16} />
                프로필 수정
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 전화번호 인증 모달 */}
      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onSuccess={handlePhoneAuthSuccess}
      />
    </>
  );
}
