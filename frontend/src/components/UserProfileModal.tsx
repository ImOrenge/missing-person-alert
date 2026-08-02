import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Calendar, Shield, AlertCircle, CheckCircle, Edit2, Save, Bell, BellOff } from 'lucide-react';
import { getAuth, updateProfile, type User as FirebaseUser } from 'firebase/auth';
import { toast } from 'react-toastify';
import { PhoneAuthModal } from './PhoneAuthModal';
import { deleteCurrentAccount } from '../services/firebase';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isPage?: boolean;
}

export default function UserProfileModal({ isOpen, onClose, isPage = false }: Props) {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const firebaseUser = (user as FirebaseUser | null) ?? null;
  const {
    status: pushStatus,
    permission: pushPermission,
    optedOut: pushOptedOut,
    isProcessing: isPushProcessing,
    enablePush: enablePushSetting,
    disablePush: disablePushSetting
  } = usePushNotifications(firebaseUser);

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

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setIsSaving(false);
      setShowPhoneAuth(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
      setIsDeleting(false);
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

  const pushStatusConfig = (() => {
    switch (pushStatus) {
      case 'enabled':
        return { label: '알림 사용 중', color: '#166534', background: '#dcfce7', icon: <Bell size={14} color="#166534" /> };
      case 'prompt':
        return { label: '권한 요청 필요', color: '#1d4ed8', background: '#dbeafe', icon: <Bell size={14} color="#1d4ed8" /> };
      case 'off':
        return { label: '알림 꺼짐', color: '#92400e', background: '#fef3c7', icon: <BellOff size={14} color="#92400e" /> };
      case 'blocked':
        return { label: '브라우저에서 차단됨', color: '#b91c1c', background: '#fee2e2', icon: <BellOff size={14} color="#b91c1c" /> };
      case 'unsupported':
      default:
        return { label: '지원되지 않음', color: '#4b5563', background: '#e5e7eb', icon: <BellOff size={14} color="#4b5563" /> };
    }
  })();

  const pushStatusMessage = (() => {
    switch (pushStatus) {
      case 'enabled':
        return '실시간 실종자 알림을 받을 준비가 완료되었습니다.';
      case 'prompt':
        return '아직 알림 권한을 허용하지 않았습니다. 아래 버튼으로 알림을 켜주세요.';
      case 'off':
        return '사용자 설정으로 알림이 꺼져 있습니다. 다시 알림을 받고 싶다면 알림 켜기 버튼을 눌러주세요.';
      case 'blocked':
        return '브라우저에서 알림이 차단되어 있습니다. 아래 안내를 따라 권한을 다시 허용한 뒤 알림을 켜주세요.';
      case 'unsupported':
      default:
        return '현재 사용 중인 브라우저 또는 기기에서는 웹 푸시 알림을 지원하지 않습니다.';
    }
  })();

  const handleEnablePushNotifications = async () => {
    if (pushStatus === 'unsupported') {
      toast.error('이 브라우저에서는 푸시 알림을 지원하지 않습니다.');
      return;
    }

    try {
      const result = await enablePushSetting();
      if (result.status === 'enabled') {
        toast.success('푸시 알림을 활성화했습니다.');
      } else if (result.status === 'blocked') {
        toast.warning('브라우저 알림이 차단되어 있습니다. 안내에 따라 권한을 허용한 뒤 다시 시도해주세요.');
      }
    } catch (error: any) {
      console.error('푸시 알림 활성화 실패:', error);
      toast.error(error?.message || '푸시 알림 활성화에 실패했습니다.');
    }
  };

  const handleDisablePushNotifications = async () => {
    try {
      const result = await disablePushSetting();
      if (result.status === 'off') {
        toast.info('푸시 알림을 비활성화했습니다.');
      }
    } catch (error: any) {
      console.error('푸시 알림 비활성화 실패:', error);
      toast.error(error?.message || '푸시 알림 비활성화에 실패했습니다.');
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);

    const result = await deleteCurrentAccount();

    if (result.success) {
      toast.success('계정이 삭제되었습니다. 이용해 주셔서 감사합니다.');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
      onClose();
      return;
    }

    if (result.requiresRecentLogin) {
      toast.error('보안을 위해 최근에 다시 로그인한 뒤 탈퇴를 진행해주세요');
    } else {
      toast.error(result.message || '계정을 삭제할 수 없습니다');
    }

    setIsDeleting(false);
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
          position: isPage ? 'static' : 'fixed',
          top: isPage ? undefined : 0,
          left: isPage ? undefined : 0,
          right: isPage ? undefined : 0,
          bottom: isPage ? undefined : 0,
          backgroundColor: isPage ? 'transparent' : 'rgba(0, 0, 0, 0.7)',
          display: showPhoneAuth ? 'none' : isPage ? 'block' : 'flex',
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
            padding: isPage ? '24px' : '30px',
            maxWidth: isPage ? 'none' : '600px',
            width: '100%',
            maxHeight: isPage ? undefined : '90vh',
            overflowY: isPage ? undefined : 'auto',
            boxShadow: isPage ? '0 1px 3px rgba(15,23,42,0.08)' : '0 10px 40px rgba(0,0,0,0.3)',
            border: isPage ? '1px solid #e2e8f0' : undefined
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

            {/* 푸시 알림 설정 */}
            <div
              style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f9fafb',
                borderRadius: '10px',
                border: '1px solid #e5e7eb'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#1f2937', fontWeight: 600 }}>푸시 알림</h4>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>
                    {pushStatusMessage}
                  </p>
                  <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                    브라우저 상태: {pushPermission === 'granted' ? '허용됨' : pushPermission === 'denied' ? '차단됨' : '권한 요청 전'}
                  </p>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '999px',
                    backgroundColor: pushStatusConfig.background,
                    color: pushStatusConfig.color,
                    fontSize: '12px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {pushStatusConfig.icon}
                  {pushStatusConfig.label}
                </span>
              </div>

              {pushStatus === 'prompt' && (
                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#2563eb' }}>
                  알림을 켜면 브라우저 권한 창이 나타납니다. &quot;허용&quot;을 선택해주세요.
                </p>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleEnablePushNotifications}
                  disabled={isPushProcessing || pushStatus === 'enabled' || pushStatus === 'unsupported'}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isPushProcessing || pushStatus === 'enabled' || pushStatus === 'unsupported' ? '#fca5a5' : '#dc2626',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: isPushProcessing || pushStatus === 'enabled' || pushStatus === 'unsupported' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Bell size={16} />
                  {isPushProcessing ? '처리 중...' : '알림 켜기'}
                </button>
                <button
                  type="button"
                  onClick={handleDisablePushNotifications}
                  disabled={isPushProcessing || pushStatus === 'off' || pushStatus === 'blocked' || pushStatus === 'unsupported'}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: isPushProcessing || pushStatus === 'off' || pushStatus === 'blocked' || pushStatus === 'unsupported' ? '#9ca3af' : '#4b5563',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: isPushProcessing || pushStatus === 'off' || pushStatus === 'blocked' || pushStatus === 'unsupported' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <BellOff size={16} />
                  알림 끄기
                </button>
              </div>

              {pushStatus === 'blocked' && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '12px',
                    lineHeight: '1.6'
                  }}
                >
                  <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>브라우저에서 알림이 차단되었습니다.</p>
                  <p style={{ margin: '0 0 8px 0' }}>
                    주소창 왼쪽의 자물쇠(사이트 정보)를 클릭해 &quot;알림&quot;을 &quot;허용&quot;으로 변경한 뒤 페이지를 새로고침하고 다시 시도해주세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const helpUrl = 'https://support.google.com/chrome/answer/3220216?hl=ko';
                      window.open(helpUrl, '_blank', 'noopener');
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#991b1b',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    브라우저 도움말 보기
                  </button>
                </div>
              )}

              {pushStatus === 'unsupported' && (
                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  모바일 앱 또는 Chrome, Edge, Samsung Internet과 같은 최신 브라우저에서 접속하면 실시간 알림을 받을 수 있습니다.
                </p>
              )}

              {pushOptedOut && pushStatus !== 'blocked' && pushStatus !== 'unsupported' && (
                <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                  알림을 끈 상태입니다. 다시 켜면 새로운 실종자 속보를 실시간으로 받아볼 수 있습니다.
                </p>
              )}
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

          <div
            style={{
              marginTop: '26px',
              padding: '18px',
              borderRadius: '10px',
              border: '1px solid #fee2e2',
              backgroundColor: '#fef2f2'
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#b91c1c', fontWeight: 'bold' }}>
              계정 삭제
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#991b1b', lineHeight: '1.6' }}>
              계정을 삭제하면 모든 프로필 정보와 제보 기록이 즉시 삭제되며 복구할 수 없습니다. 더 이상 서비스 이용이 필요하지 않을 때만 진행해주세요.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText('');
                setShowDeleteConfirm(true);
              }}
              style={{
                padding: '10px 18px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              계정 영구 삭제
            </button>
          </div>
        </div>
      </div>

      {/* 전화번호 인증 모달 */}
      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onSuccess={handlePhoneAuthSuccess}
        mode="signup"
      />

      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
            padding: '20px'
          }}
          onClick={() => {
            if (!isDeleting) {
              setShowDeleteConfirm(false);
              setDeleteConfirmText('');
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 15px 40px rgba(220, 38, 38, 0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <AlertCircle size={28} color="#dc2626" />
              <h4 style={{ margin: 0, fontSize: '18px', color: '#b91c1c', fontWeight: 'bold' }}>정말로 계정을 삭제하시겠습니까?</h4>
            </div>
            <p style={{ margin: '0 0 18px 0', fontSize: '14px', color: '#7f1d1d', lineHeight: '1.6' }}>
              이 작업은 취소할 수 없으며, 모든 개인정보와 제보 기록이 즉시 삭제됩니다. 계속하려면 아래 입력란에 <strong>삭제</strong>라고 입력해주세요.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="삭제"
              disabled={isDeleting}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #f87171',
                marginBottom: '20px',
                fontSize: '14px'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }
                }}
                disabled={isDeleting}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff',
                  color: '#4b5563',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.6 : 1
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== '삭제' || isDeleting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: deleteConfirmText === '삭제' && !isDeleting ? '#dc2626' : '#fca5a5',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  cursor: deleteConfirmText === '삭제' && !isDeleting ? 'pointer' : 'not-allowed',
                  minWidth: '120px'
                }}
              >
                {isDeleting ? '삭제 중…' : '영구 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
