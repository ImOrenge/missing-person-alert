import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellOff, ChevronLeft, ChevronRight, LogIn, LogOut, UserCircle, Plus, FileText, Shield, User as UserIcon, Menu } from 'lucide-react';
import EmergencyMap from './components/EmergencyMap';
import Sidebar from './components/Sidebar';
import FilterPanel from './components/FilterPanel';
import ReportModal from './components/ReportModal';
import MyReportsModal from './components/MyReportsModal';
import AdminDashboard from './components/AdminDashboard';
import LoginModal from './components/LoginModal';
import UserProfileModal from './components/UserProfileModal';
import VerificationPromptModal from './components/VerificationPromptModal';
import { PhoneAuthModal } from './components/PhoneAuthModal';
import AnnouncementBanner from './components/AnnouncementBanner';
import NewMissingPersonBanner from './components/NewMissingPersonBanner';
import AnnouncementPopup from './components/AnnouncementPopup';
import NotificationBell from './components/NotificationBell';
import { useEmergencyStore } from './stores/emergencyStore';
import { ToastContainer, toast } from 'react-toastify';
import { onAuthChange, logout as firebaseLogout } from './services/firebase';
import { hasAdminAccess } from './utils/adminUtils';
import { loadRecaptchaScript } from './utils/recaptcha';
import { getBannerAnnouncements, getPopupAnnouncements } from './services/announcementService';
import type { User } from 'firebase/auth';
import type { Announcement } from './types/announcement';
import 'react-toastify/dist/ReactToastify.css';
import { isAnnouncementPopupClosedForCurrentSession } from './utils/announcementStorage';
import { usePresenceTracking } from './hooks/usePresenceTracking';
import { onForegroundMessage } from './services/firebaseMessaging';
import { detachFcmToken, getLocalTokenState } from './services/userTokenService';
import { usePushNotifications, PUSH_PROMPT_STORAGE_KEY } from './hooks/usePushNotifications';

function App() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMyReportsModal, setShowMyReportsModal] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);
  const [showPhoneAuth, setShowPhoneAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [bannerAnnouncements, setBannerAnnouncements] = useState<Announcement[]>([]);
  const [popupAnnouncements, setPopupAnnouncements] = useState<Announcement[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const pushPromptToastRef = useRef<React.ReactText | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const missingPersons = useEmergencyStore(state => state.missingPersons);

  usePresenceTracking(currentUser);

  const { status: pushStatus, enablePush, syncExistingToken } = usePushNotifications(currentUser);

  const handleEnablePush = useCallback(async () => {
    try {
      const result = await enablePush();
      if (result.status === 'enabled') {
        if (result.token) {
          console.log('[FCM] 발급된 토큰:', result.token);
        }
        toast.success('푸시 알림이 활성화되었습니다', { autoClose: 4000 });
      } else if (result.status === 'blocked') {
        toast.warning('브라우저 알림이 차단되어 있습니다. 설정에서 허용한 뒤 다시 시도해주세요.');
      }
    } catch (error: any) {
      console.error('푸시 알림 설정 실패:', error);
      toast.error(error?.message || '푸시 알림 설정 중 오류가 발생했습니다');
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
      }
      if (pushPromptToastRef.current) {
        toast.dismiss(pushPromptToastRef.current);
        pushPromptToastRef.current = null;
      }
    }
  }, [enablePush]);

  const dismissPushPrompt = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
    }
    if (pushPromptToastRef.current) {
      toast.dismiss(pushPromptToastRef.current);
      pushPromptToastRef.current = null;
    }
  }, []);

  // reCAPTCHA 전역 초기화
  useEffect(() => {
    const initRecaptcha = async () => {
      try {
        await loadRecaptchaScript();
        console.log('✅ reCAPTCHA 전역 초기화 완료');
      } catch (error) {
        console.warn('⚠️ reCAPTCHA 초기화 실패 (제보 시 다시 시도됩니다):', error);
      }
    };

    initRecaptcha();
  }, []);

  // Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user);
      if (user) {
        const adminAccess = hasAdminAccess(user.email, user.uid);
        setIsAdmin(adminAccess);

        if (adminAccess) {
          toast.success(`🛡️ 관리자 권한으로 로그인되었습니다!`);
        } else {
          toast.success(`환영합니다, ${user.displayName || user.email}님!`);
        }

        // SNS 로그인 유저(전화번호 없음)는 프로필 모달 자동 열기
        if (!user.phoneNumber) {
          // 로그인 직후에만 (1초 후에 체크)
          setTimeout(() => {
            const isFirstLogin = sessionStorage.getItem('phone_prompt_shown') !== 'true';
            if (isFirstLogin) {
              setShowUserProfile(true);
              sessionStorage.setItem('phone_prompt_shown', 'true');
              toast.info('📱 실종자 제보를 위해 전화번호 인증이 필요합니다', { autoClose: 5000 });
            }
          }, 1000);
        }
      } else {
        setIsAdmin(false);
        // 로그아웃 시 세션 스토리지 초기화
        sessionStorage.removeItem('phone_prompt_shown');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    onForegroundMessage((payload) => {
      console.log('[FCM] foreground 메시지 수신:', payload);
      const notification = (payload as any)?.notification;
      if (notification?.title || notification?.body) {
        toast.info(
          <div>
            <div style={{ fontWeight: 600 }}>{notification.title ?? '실시간 실종자 알림'}</div>
            {notification.body && (
              <div style={{ fontSize: '13px', marginTop: '4px' }}>{notification.body}</div>
            )}
          </div>,
          { position: 'bottom-right' }
        );
      }
    }).then((fn) => {
      unsubscribe = fn;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      if (pushPromptToastRef.current) {
        toast.dismiss(pushPromptToastRef.current);
        pushPromptToastRef.current = null;
      }
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (pushStatus === 'enabled') {
      window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
      syncExistingToken()
        .then((result) => {
          if (result.synced && result.token) {
            console.log('[FCM] 기존 토큰:', result.token);
          }
        })
        .catch((error) => {
          console.error('FCM 토큰 동기화 실패:', error);
        });
      return;
    }

    if (pushStatus === 'blocked' || pushStatus === 'off') {
      window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
      return;
    }

    if (pushStatus !== 'prompt') {
      return;
    }

    const alreadyPrompted = window.localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === 'true';
    if (alreadyPrompted) {
      return;
    }

    if (!pushPromptToastRef.current || !toast.isActive(pushPromptToastRef.current)) {
      pushPromptToastRef.current = toast.info(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#1f2937' }}>
            실시간 실종자 속보를 푸시 알림으로 받아보시겠어요?
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={dismissPushPrompt}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#4b5563',
                cursor: 'pointer'
              }}
            >
              나중에
            </button>
            <button
              onClick={handleEnablePush}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#dc2626',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              알림 활성화
            </button>
          </div>
        </div>,
        {
          position: 'bottom-right',
          autoClose: false,
          closeOnClick: false,
          closeButton: true,
          pauseOnFocusLoss: false
        }
      );
    }

    return () => {
      if (pushPromptToastRef.current) {
        toast.dismiss(pushPromptToastRef.current);
        pushPromptToastRef.current = null;
      }
    };
  }, [currentUser, pushStatus, syncExistingToken, dismissPushPrompt, handleEnablePush]);

  // Firestore에서 공지사항 불러오기
  useEffect(() => {
    const loadAnnouncements = async () => {
      const [banners, popups] = await Promise.all([
        getBannerAnnouncements(),
        getPopupAnnouncements()
      ]);
      setBannerAnnouncements(banners);
      setPopupAnnouncements(popups);

      const shouldShowPopup = popups.length > 0 && !isAnnouncementPopupClosedForCurrentSession();
      setShowPopup(shouldShowPopup);
    };

    loadAnnouncements();

    // 5분마다 새로고침
    const interval = setInterval(loadAnnouncements, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 배너 공지사항 자동 슬라이드 (입력 필드에 포커스가 없을 때만)
  useEffect(() => {
    if (bannerAnnouncements.length === 0) return;

    const interval = setInterval(() => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.getAttribute('contenteditable') === 'true');

      if (isTyping) {
        return;
      }

      setCurrentAnnouncementIndex((prev) => (prev + 1) % bannerAnnouncements.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [bannerAnnouncements.length]);

  const handleLogout = async () => {
    if (currentUser) {
      const localTokenState = getLocalTokenState();
      const tokenToDetach = localTokenState?.token ?? null;
      if (tokenToDetach) {
        try {
          await detachFcmToken(currentUser.uid, tokenToDetach);
        } catch (error) {
          console.warn('푸시 토큰 해제 실패 (무시 가능):', error);
        }
      }
    }

    const result = await firebaseLogout();
    if (result.success) {
      setCurrentUser(null);
      toast.info('로그아웃되었습니다');
    } else {
      toast.error('로그아웃 실패');
    }
  };

  const handleReportClick = () => {
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }

    // 전화번호 인증 확인
    if (!currentUser.phoneNumber) {
      // UserProfileModal을 띄워서 전화번호 인증 유도
      setShowUserProfile(true);
      toast.warning('📱 실종자 제보를 위해 먼저 전화번호 인증이 필요합니다', { autoClose: 5000 });
      return;
    }

    setShowReportModal(true);
  };

  const handlePhoneAuthSuccess = () => {
    setShowPhoneAuth(false);
    toast.success('전화번호 인증이 완료되었습니다!');

    // 사용자 정보 새로고침
    const auth = require('firebase/auth').getAuth();
    auth.currentUser?.reload().then(() => {
      setCurrentUser(auth.currentUser);
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg z-50">
        {/* 모바일: 두 줄로 분리 */}
        <div className="md:hidden relative">
          {/* 첫 번째 줄: 타이틀과 메뉴 토글 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-500">
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-red-700 rounded-lg transition-colors"
              >
                {showSidebar ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </button>
              <h1 className="text-lg font-bold truncate">🚨 실시간 실종자 알림</h1>
              <span className="px-2 py-0.5 bg-red-800 rounded-full text-xs font-semibold whitespace-nowrap">
                {missingPersons.length}명
              </span>
            </div>
            <button
              onClick={() => setShowMobileMenu(prev => !prev)}
              className="ml-3 p-2 hover:bg-red-700 rounded-lg transition-colors"
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* 두 번째 줄: 버튼들 */}
          <div className="flex items-center justify-end px-4 py-2">
            {currentUser ? (
              <button
                onClick={async () => {
                  setShowMobileMenu(false);
                  await handleLogout();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                <span className="text-sm">로그아웃</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  setShowLoginModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
              >
                <LogIn size={16} />
                <span className="text-sm">로그인</span>
              </button>
            )}
          </div>

          {showMobileMenu && (
            <>
              <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setShowMobileMenu(false)}
              />
              <div className="absolute right-4 top-full mt-2 z-50 w-72 bg-white text-gray-800 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-sm font-semibold text-gray-700">빠른 메뉴</p>
                  <p className="text-xs text-gray-500 mt-1">자주 사용되는 기능을 모았습니다.</p>
                </div>
                <div className="py-2">
                  <button
                    onClick={() => {
                      setAlertsEnabled(!alertsEnabled);
                      setShowMobileMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-3 text-sm">
                      {alertsEnabled ? <Bell size={18} className="text-red-500" /> : <BellOff size={18} className="text-gray-500" />}
                      <span>{alertsEnabled ? '실시간 알림 끄기' : '실시간 알림 켜기'}</span>
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${alertsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {alertsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="px-4 py-2 border-t border-gray-200">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <NotificationBell />
                      알림 센터
                    </span>
                  </div>

                  <div className="mt-2 border-t border-gray-200">
                    {currentUser ? (
                      <div className="flex flex-col">
                        <button
                          onClick={() => {
                            setShowMyReportsModal(true);
                            setShowMobileMenu(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                        >
                          <FileText size={18} />
                          내 제보 보기
                        </button>
                        <button
                          onClick={() => {
                            setShowUserProfile(true);
                            setShowMobileMenu(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                        >
                          <UserIcon size={18} />
                          프로필 관리
                        </button>
                        <button
                          onClick={() => {
                            setShowMobileMenu(false);
                            handleReportClick();
                          }}
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                        >
                          <Plus size={18} />
                          실종 제보하기
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setShowAdminDashboard(true);
                              setShowMobileMenu(false);
                            }}
                            className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                          >
                            <Shield size={18} />
                            관리자 대시보드
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-2 text-xs text-gray-500">
                        로그인 후 제보, 알림 설정 등 모든 기능을 이용할 수 있습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 데스크톱: 한 줄 */}
        <div className="hidden md:flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
            >
              {showSidebar ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
            </button>
            <h1 className="text-xl md:text-2xl font-bold">🚨 실시간 실종자 알림</h1>
            <span className="px-3 py-1 bg-red-800 rounded-full text-sm">
              {missingPersons.length}명
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 알림 토글 */}
            <button
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
              title={alertsEnabled ? '알림 끄기' : '알림 켜기'}
            >
              {alertsEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            </button>
            <NotificationBell />

            {/* 로그인/로그아웃 */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => setShowAdminDashboard(true)}
                    className="p-2 hover:bg-red-700 rounded-lg transition-colors bg-yellow-500 hover:bg-yellow-600"
                    title="관리자 대시보드"
                  >
                    <Shield size={20} />
                  </button>
                )}
                <button
                  onClick={() => setShowMyReportsModal(true)}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="내 제보 기록"
                >
                  <FileText size={20} />
                </button>
                <button
                  onClick={() => setShowUserProfile(true)}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="내 프로필"
                >
                  <UserIcon size={20} />
                </button>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-800 rounded-full cursor-pointer" onClick={() => setShowUserProfile(true)}>
                  {isAdmin && <Shield size={16} color="#fbbf24" />}
                  <UserCircle size={18} />
                  <span className="text-sm">{currentUser.displayName || currentUser.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="로그아웃"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
              >
                <LogIn size={18} />
                <span className="text-sm">로그인</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden pb-10 relative">
        {/* 사이드바 */}
        {showSidebar && (
          <Sidebar
            onShowFilters={() => setShowFilters(!showFilters)}
            showFilters={showFilters}
          />
        )}

        {/* 지도 */}
        <div className="flex-1 relative">
          <NewMissingPersonBanner />
          <EmergencyMap />
        </div>

        {/* 필터 패널 (오버레이 - 모바일은 전체 화면, 데스크톱은 적당한 크기) */}
        {showFilters && (
          <>
            {/* 배경 오버레이 (데스크톱에서만 표시) */}
            <div
              className="hidden md:block absolute inset-0 bg-black bg-opacity-30 z-40"
              onClick={() => setShowFilters(false)}
            />
            {/* 필터 패널 */}
            <div className="absolute inset-0 md:inset-auto md:top-4 md:left-1/2 md:-translate-x-1/2 md:w-[600px] md:max-h-[calc(100vh-8rem)] md:rounded-xl z-50 bg-white shadow-2xl overflow-y-auto">
              <FilterPanel onClose={() => setShowFilters(false)} />
            </div>
          </>
        )}
      </div>

      {/* 제보하기 버튼 (로그인 시에만 표시) */}
      {currentUser && (
        <button
          onClick={handleReportClick}
          className="fixed bottom-20 right-6 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 transition-all hover:scale-105 z-40"
        >
          <Plus size={20} />
          <span className="font-semibold">실종자 제보</span>
        </button>
      )}

      {/* 모달들 */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
      />

      <MyReportsModal
        isOpen={showMyReportsModal}
        onClose={() => setShowMyReportsModal(false)}
      />

      <AdminDashboard
        isOpen={showAdminDashboard}
        onClose={() => setShowAdminDashboard(false)}
      />

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <UserProfileModal
        isOpen={showUserProfile}
        onClose={() => setShowUserProfile(false)}
      />

      <VerificationPromptModal
        isOpen={showVerificationPrompt}
        onClose={() => setShowVerificationPrompt(false)}
        onVerify={() => setShowPhoneAuth(true)}
      />

      <PhoneAuthModal
        isOpen={showPhoneAuth}
        onClose={() => setShowPhoneAuth(false)}
        onSuccess={handlePhoneAuthSuccess}
      />

      {/* 토스트 알림 */}
      <ToastContainer
        position="bottom-left"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      {/* 공지사항 배너 (하단) */}
      {bannerAnnouncements.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <AnnouncementBanner
            announcement={bannerAnnouncements[currentAnnouncementIndex]}
            onPrev={() => setCurrentAnnouncementIndex((prev) => (prev - 1 + bannerAnnouncements.length) % bannerAnnouncements.length)}
            onNext={() => setCurrentAnnouncementIndex((prev) => (prev + 1) % bannerAnnouncements.length)}
          />
        </div>
      )}

      {/* 공지사항 팝업 */}
      {showPopup && popupAnnouncements.length > 0 && (
        <AnnouncementPopup
          announcements={popupAnnouncements}
          onClose={() => setShowPopup(false)}
        />
      )}
    </div>
  );
}

export default App;
