import React, { useState, useEffect } from 'react';
import { Bell, BellOff, ChevronLeft, ChevronRight, LogIn, LogOut, UserCircle, Plus, FileText, Shield, User as UserIcon } from 'lucide-react';
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
import AnnouncementPopup from './components/AnnouncementPopup';
import NotificationBell from './components/NotificationBell';
import { useEmergencyStore } from './stores/emergencyStore';
import { useApiData } from './hooks/useApiData';
import { ToastContainer, toast } from 'react-toastify';
import { onAuthChange, logout as firebaseLogout } from './services/firebase';
import { hasAdminAccess } from './utils/adminUtils';
import { loadRecaptchaScript } from './utils/recaptcha';
import { getBannerAnnouncements, getPopupAnnouncements } from './services/announcementService';
import type { User } from 'firebase/auth';
import type { Announcement } from './types/announcement';
import 'react-toastify/dist/ReactToastify.css';

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

  const { isConnected } = useApiData();
  const missingPersons = useEmergencyStore(state => state.missingPersons);

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

  // Firestore에서 공지사항 불러오기
  useEffect(() => {
    const loadAnnouncements = async () => {
      const [banners, popups] = await Promise.all([
        getBannerAnnouncements(),
        getPopupAnnouncements()
      ]);
      setBannerAnnouncements(banners);
      setPopupAnnouncements(popups);

      // 팝업 공지가 있으면 표시
      if (popups.length > 0) {
        setShowPopup(true);
      }
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
        <div className="md:hidden">
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
          </div>

          {/* 두 번째 줄: 버튼들 */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              {/* 알림 토글 */}
              <button
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                title={alertsEnabled ? '알림 끄기' : '알림 켜기'}
              >
                {alertsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
              <NotificationBell />

              {/* 연결 상태 */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-medium">{isConnected ? '연결' : '끊김'}</span>
              </div>
            </div>

            {/* 로그인/로그아웃 */}
            {currentUser ? (
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <button
                    onClick={() => setShowAdminDashboard(true)}
                    className="p-2 hover:bg-red-700 rounded-lg transition-colors bg-yellow-500 hover:bg-yellow-600"
                    title="관리자"
                  >
                    <Shield size={18} />
                  </button>
                )}
                <button
                  onClick={() => setShowMyReportsModal(true)}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="내 제보"
                >
                  <FileText size={18} />
                </button>
                <button
                  onClick={() => setShowUserProfile(true)}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="프로필"
                >
                  <UserIcon size={18} />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="로그아웃"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
              >
                <LogIn size={16} />
                <span className="text-sm">로그인</span>
              </button>
            )}
          </div>
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

            {/* 연결 상태 */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium">{isConnected ? '연결됨' : '연결 끊김'}</span>
            </div>

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
