import React, { useState, useEffect } from 'react';
import { Bell, BellOff, ChevronLeft, ChevronRight, LogIn, LogOut, UserCircle, Plus, FileText } from 'lucide-react';
import EmergencyMap from './components/EmergencyMap';
import Sidebar from './components/Sidebar';
import FilterPanel from './components/FilterPanel';
import ReportModal from './components/ReportModal';
import MyReportsModal from './components/MyReportsModal';
import LoginModal from './components/LoginModal';
import AnnouncementBanner from './components/AnnouncementBanner';
import { useEmergencyStore } from './stores/emergencyStore';
import { useApiData } from './hooks/useApiData';
import { ToastContainer, toast } from 'react-toastify';
import { onAuthChange, logout as firebaseLogout } from './services/firebase';
import type { User } from 'firebase/auth';
import 'react-toastify/dist/ReactToastify.css';

const ANNOUNCEMENTS = [
  { id: 1, text: '실종자를 발견하시면 즉시 112 또는 182(실종아동찾기센터)로 신고해주세요', type: 'info' as const },
  { id: 2, text: '허위 신고 시 법적 책임을 질 수 있습니다', type: 'warning' as const },
  { id: 3, text: '실시간 알림을 켜두시면 새로운 실종자 정보를 즉시 받아보실 수 있습니다', type: 'info' as const },
  { id: 4, text: '실종자 정보는 경찰청 공공데이터를 기반으로 제공됩니다', type: 'info' as const },
  { id: 5, text: '실종 골든타임은 48시간입니다. 신속한 제보가 생명을 살립니다', type: 'warning' as const }
];

function App() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMyReportsModal, setShowMyReportsModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);

  const { isConnected } = useApiData();
  const missingPersons = useEmergencyStore(state => state.missingPersons);

  // Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user);
      if (user) {
        toast.success(`환영합니다, ${user.displayName || user.email}님!`);
      }
    });

    return () => unsubscribe();
  }, []);

  // 공지사항 자동 슬라이드
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAnnouncementIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    const result = await firebaseLogout();
    if (result.success) {
      setCurrentUser(null);
      toast.info('로그아웃되었습니다');
    } else {
      toast.error('로그아웃 실패');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 상단 헤더 */}
      <header className="bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg z-50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
            >
              {showSidebar ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
            </button>
            <h1 className="text-xl md:text-2xl font-bold">🚨 실시간 실종자 알림</h1>
            <span className="hidden md:inline-block px-3 py-1 bg-red-800 rounded-full text-sm">
              {missingPersons.length}명
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 알림 토글 */}
            <button
              onClick={() => setNotifications(!notifications)}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
              title={notifications ? '알림 끄기' : '알림 켜기'}
            >
              {notifications ? <Bell size={20} /> : <BellOff size={20} />}
            </button>

            {/* 연결 상태 */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-medium hidden sm:inline">{isConnected ? '연결됨' : '연결 끊김'}</span>
            </div>

            {/* 로그인/로그아웃 */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMyReportsModal(true)}
                  className="p-2 hover:bg-red-700 rounded-lg transition-colors"
                  title="내 제보 기록"
                >
                  <FileText size={20} />
                </button>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-800 rounded-full">
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
                <span className="hidden sm:inline text-sm">로그인</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 overflow-hidden">
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

          {/* 필터 패널 (오버레이) */}
          {showFilters && (
            <div className="absolute top-0 left-0 right-0 z-10 bg-white shadow-lg">
              <FilterPanel onClose={() => setShowFilters(false)} />
            </div>
          )}
        </div>
      </div>

      {/* 제보하기 버튼 (로그인 시에만 표시) */}
      {currentUser && (
        <button
          onClick={() => setShowReportModal(true)}
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

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
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
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <AnnouncementBanner
          announcement={ANNOUNCEMENTS[currentAnnouncementIndex]}
          onPrev={() => setCurrentAnnouncementIndex((prev) => (prev - 1 + ANNOUNCEMENTS.length) % ANNOUNCEMENTS.length)}
          onNext={() => setCurrentAnnouncementIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length)}
        />
      </div>
    </div>
  );
}

export default App;
