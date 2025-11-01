import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, BellOff, ChevronLeft, ChevronRight, LogIn, LogOut, UserCircle, Plus, FileText, Shield, User as UserIcon, Menu, BarChart3, Home, LayoutGrid } from 'lucide-react';
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
import StatisticsModal from './components/StatisticsModal';
import { useEmergencyStore } from './stores/emergencyStore';
import { ToastContainer, toast } from 'react-toastify';
import { onAuthChange, logout as firebaseLogout } from './services/firebase';
import { hasAdminAccess } from './utils/adminUtils';
import { loadRecaptchaScript } from './utils/recaptcha';
import { getBannerAnnouncements, getPopupAnnouncements } from './services/announcementService';
import type { User } from 'firebase/auth';
import type { Announcement } from './types/announcement';
import 'react-toastify/dist/ReactToastify.css';
import { onForegroundMessage } from './services/firebaseMessaging';
import { detachFcmToken, getLocalTokenState } from './services/userTokenService';
import { usePushNotifications, PUSH_PROMPT_STORAGE_KEY } from './hooks/usePushNotifications';
import { useApiData } from './hooks/useApiData';
import { getRegionStatsUpdateInfo } from './services/regionStatsService';
import { useGuestId } from './hooks/useGuestId';
import { setAnalyticsGuestId, setAnalyticsAuthenticatedUser, logLoginEvent, logLogoutEvent } from './services/analyticsService';
import { logger } from './utils/logger';
import { cacheMissingPersons, hydrateMissingPersonsFromCache, cacheAnnouncements } from './utils/offlineCache';
import { hasUndismissedPopupForToday } from './utils/announcementPopupStorage';
import type { MissingPerson, MissingPersonStatus } from './types';
import { useActiveSessionTracker } from './hooks/useActiveSessionTracker';
import { DesktopGridView } from './components/DesktopGridView';

const GRID_VIEW_PREF_KEY = 'missing_person_desktop_grid_view';
const INSTALL_PROMPT_DISMISSED_KEY = 'missing_person_install_prompt_snooze_until';
const INSTALL_PROMPT_SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [showStatisticsModal, setShowStatisticsModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [bannerAnnouncements, setBannerAnnouncements] = useState<Announcement[]>([]);
  const [popupAnnouncements, setPopupAnnouncements] = useState<Announcement[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const pushPromptToastRef = useRef<React.ReactText | null>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const installToastRef = useRef<React.ReactText | null>(null);
  const swUpdateRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const swUpdateToastRef = useRef<React.ReactText | null>(null);
  const swRefreshingRef = useRef(false);
  const shareTargetHandledRef = useRef(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [statsHasFreshData, setStatsHasFreshData] = useState(false);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number | undefined>(undefined);
  const [showInstallShortcut, setShowInstallShortcut] = useState(false);
  const [showGridView, setShowGridView] = useState(false);

  useApiData();
  useActiveSessionTracker(currentUser);

  const missingPersons = useEmergencyStore(state => state.missingPersons);
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const filteredPersons = useEmergencyStore(state => state.getFilteredPersons());
  const setSelectedPersonId = useEmergencyStore(state => state.setSelectedPersonId);
  const setHoveredPersonId = useEmergencyStore(state => state.setHoveredPersonId);
  const newPersonAlerts = useEmergencyStore(state => state.newPersonAlerts);
  const shiftNewPersonAlert = useEmergencyStore(state => state.shiftNewPersonAlert);

  const { status: pushStatus, enablePush, syncExistingToken } = usePushNotifications(currentUser);
  const { guestIdInfo, userType } = useGuestId(currentUser);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const pendingPersonReasonRef = useRef<'deeplink' | 'notification' | null>(null);
  const newAlertProcessingRef = useRef(false);
  const activeAlertToastIdRef = useRef<React.ReactText | null>(null);
  const alertsEnabledRef = useRef(alertsEnabled);
  const newPersonAlertCount = newPersonAlerts.length;

  // 게스트 사용자 닉네임 생성
  const guestNickname = useMemo(() => {
    if (!guestIdInfo) return '게스트';
    const parts = guestIdInfo.guestId.split('_');
    const lastPart = parts[parts.length - 1];
    return `게스트-${lastPart.substring(0, 4).toUpperCase()}`;
  }, [guestIdInfo]);

  const statsUpdatedLabel = useMemo(() => {
    if (!statsUpdatedAt) {
      return undefined;
    }
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false
      }).format(new Date(statsUpdatedAt));
    } catch (error) {
      logger.warn('통계 업데이트 시각 포맷 실패', error);
      return undefined;
    }
  }, [statsUpdatedAt]);

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const personId = params.get('personId');
    if (personId) {
      setPendingPersonId(personId);
      pendingPersonReasonRef.current = 'deeplink';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(GRID_VIEW_PREF_KEY);
    if (stored === 'true') {
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        setShowGridView(true);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (!isDesktop && !showGridView) {
      return;
    }
    window.localStorage.setItem(GRID_VIEW_PREF_KEY, showGridView ? 'true' : 'false');
  }, [showGridView]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = () => {
      if (!mediaQuery.matches) {
        setShowGridView(false);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    handleChange();
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (missingPersons.length === 0) {
      const cached = hydrateMissingPersonsFromCache();
      if (cached && cached.length > 0) {
        const fallbackPersons: MissingPerson[] = cached.map((item, index) => {
          const statusValue: MissingPersonStatus =
            item.status === 'found' || item.status === 'investigating' ? (item.status as MissingPersonStatus) : 'active';
          return {
            id: item.id || `offline-${index}`,
            name: item.name || '이름 미상',
            age: 0,
            gender: 'U',
            location: {
              lat: 0,
              lng: 0,
              address: item.address || '최근 위치 정보 없음'
            },
            description: '오프라인에서 확인된 요약 정보입니다.',
            missingDate: item.missingDate ?? '',
            type: 'unknown',
            status: statusValue,
            source: 'api'
          };
        });
        setMissingPersons(fallbackPersons);
      }
    } else {
      cacheMissingPersons(missingPersons);
    }
  }, [missingPersons, setMissingPersons]);

  useEffect(() => {
    if (!pendingPersonId) {
      return;
    }

    const target = missingPersons.find((person) => person.id === pendingPersonId);
    if (!target) {
      return;
    }

    setSelectedPersonId(target.id);
    setHoveredPersonId(target.id);

    if (pendingPersonReasonRef.current === 'notification') {
      toast.info(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <strong style={{ fontSize: '13px', color: '#b91c1c' }}>새로운 실종자 알림</strong>
          <span style={{ fontSize: '13px', color: '#1f2937' }}>
            {target.name}님의 상세 정보를 열었습니다.
          </span>
        </div>,
        { autoClose: 4000, position: 'bottom-right' }
      );
    }

    if (typeof window !== 'undefined') {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has('personId')) {
          currentUrl.searchParams.delete('personId');
          window.history.replaceState(
            null,
            document.title,
            `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
          );
        }
      } catch (error) {
        logger.warn('딥링크 정리 실패', error);
      }
    }

    pendingPersonReasonRef.current = null;
    setPendingPersonId(null);
  }, [pendingPersonId, missingPersons, setSelectedPersonId, setHoveredPersonId]);

  useEffect(() => {
    if (shareTargetHandledRef.current || typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('share-target') !== '1') {
      return;
    }

    shareTargetHandledRef.current = true;
    const sharedTitle = params.get('title');
    const sharedText = params.get('text');
    const sharedUrl = params.get('url');

    toast.info(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '13px', color: '#1f2937' }}>공유 받은 정보를 제보로 남기시겠어요?</span>
        {sharedTitle && <strong style={{ fontSize: '13px' }}>{sharedTitle}</strong>}
        {sharedText && <span style={{ fontSize: '12px', color: '#4b5563' }}>{sharedText}</span>}
        {sharedUrl && (
          <a
            href={sharedUrl}
            style={{ fontSize: '12px', color: '#dc2626', textDecoration: 'underline' }}
            target="_blank"
            rel="noreferrer"
          >
            {sharedUrl}
          </a>
        )}
      </div>,
      { autoClose: 6000, position: 'bottom-right' }
    );

    if (currentUser) {
      setShowReportModal(true);
    } else {
      setShowLoginModal(true);
    }

    if (window.history && window.history.replaceState) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [currentUser]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const { data } = event;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'OPEN_MISSING_PERSON') {
        const payload = data.payload || {};
        const candidateId =
          (typeof payload.missingPersonId === 'string' && payload.missingPersonId.trim().length > 0
            ? payload.missingPersonId
            : typeof payload.id === 'string'
            ? payload.id
            : null);

        if (candidateId) {
          setPendingPersonId(candidateId);
          pendingPersonReasonRef.current = 'notification';

          if (typeof window !== 'undefined' && typeof payload.url === 'string') {
            try {
              const targetUrl = new URL(payload.url, window.location.origin);
              window.history.replaceState(
                null,
                document.title,
                `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`
              );
            } catch (error) {
              logger.warn('알림 링크 처리 실패', error);
            }
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [setPendingPersonId]);

  const processNewPersonAlerts = useCallback(() => {
    if (!alertsEnabledRef.current) {
      return;
    }

    if (newAlertProcessingRef.current) {
      return;
    }

    const nextAlert = shiftNewPersonAlert();
    if (!nextAlert || !Array.isArray(nextAlert.persons) || nextAlert.persons.length === 0) {
      return;
    }

    newAlertProcessingRef.current = true;
    const persons = nextAlert.persons;
    const topPersons = persons.slice(0, 3);
    const extraCount = Math.max(0, persons.length - topPersons.length);
    const primaryPerson = topPersons[0];

    let toastId: React.ReactText;

    const handleSelectPerson = (personId?: string) => {
      if (!personId) {
        return;
      }
      setSelectedPersonId(personId);
      setHoveredPersonId(personId);
      toast.dismiss(toastId);
    };

    const handleDismiss = () => {
      toast.dismiss(toastId);
    };

    toastId = toast.info(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: '14px' }}>
          {persons.length === 1
            ? '새로운 실종자 제보가 도착했습니다.'
            : `새로운 실종자 ${persons.length}건이 업데이트되었습니다.`}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {topPersons.map((person) => (
            <div
              key={person.id}
              style={{
                fontSize: '13px',
                color: '#1f2937',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <span style={{ fontWeight: 600 }}>{person.name}</span>
              <span style={{ color: '#6b7280', textAlign: 'right' }}>
                {person.location?.address || '위치 미상'}
              </span>
            </div>
          ))}
          {extraCount > 0 && (
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              외 {extraCount}건의 실종 정보가 추가되었습니다.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          {primaryPerson && (
            <button
              type="button"
              onClick={() => handleSelectPerson(primaryPerson.id)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#ef4444',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              지도에서 보기
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#fff',
              color: '#374151',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>,
      {
        position: 'top-center',
        autoClose: 10000,
        closeOnClick: false,
        pauseOnHover: true,
        hideProgressBar: false,
        onClose: () => {
          activeAlertToastIdRef.current = null;
          newAlertProcessingRef.current = false;
          setTimeout(() => {
            if (alertsEnabledRef.current) {
              processNewPersonAlerts();
            }
          }, 200);
        }
      }
    );

    activeAlertToastIdRef.current = toastId;
  }, [shiftNewPersonAlert, setSelectedPersonId, setHoveredPersonId]);

  useEffect(() => {
    if (!alertsEnabled) {
      if (activeAlertToastIdRef.current) {
        toast.dismiss(activeAlertToastIdRef.current);
        activeAlertToastIdRef.current = null;
      }
      newAlertProcessingRef.current = false;
      return;
    }
    processNewPersonAlerts();
  }, [alertsEnabled, newPersonAlertCount, processNewPersonAlerts]);

  const handleEnablePush = useCallback(async () => {
    try {
      const result = await enablePush();
      if (result.status === 'enabled') {
        if (result.token) {
          logger.log('[FCM] 발급된 토큰:', result.token);
        }
        toast.success('푸시 알림이 활성화되었습니다', { autoClose: 4000 });
      } else if (result.status === 'blocked') {
        toast.warning('브라우저 알림이 차단되어 있습니다. 설정에서 허용한 뒤 다시 시도해주세요.');
      }
    } catch (error: any) {
      logger.error('푸시 알림 설정 실패:', error);
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

  const dismissInstallPrompt = useCallback((reason?: 'later' | 'auto') => {
    if (typeof window !== 'undefined' && reason === 'later') {
      const snoozeUntil = Date.now() + INSTALL_PROMPT_SNOOZE_DURATION_MS;
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, String(snoozeUntil));
    }
    if (installToastRef.current && toast.isActive(installToastRef.current)) {
      toast.dismiss(installToastRef.current);
    }
    installToastRef.current = null;
    if (reason !== 'later') {
      installPromptRef.current = null;
    }
  }, []);

  const handleInstallApp = useCallback(async () => {
    try {
      const promptEvent = installPromptRef.current;
      if (!promptEvent) {
        toast.info('브라우저 메뉴에서 "홈 화면에 추가"를 선택해 설치할 수 있습니다.', { autoClose: 4000 });
        return;
      }
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') {
        toast.success('앱 설치를 시작합니다.', { autoClose: 3500 });
      } else {
        toast.info('언제든지 앱 메뉴에서 다시 설치할 수 있습니다.', { autoClose: 3500 });
      }
    } catch (error) {
      logger.warn('앱 설치 프롬프트 표시 실패', error);
      toast.error('앱 설치 프롬프트를 여는 동안 문제가 발생했습니다.');
    } finally {
      dismissInstallPrompt();
    }
  }, [dismissInstallPrompt]);

  const requestServiceWorkerUpdate = useCallback(() => {
    const registration = swUpdateRegistrationRef.current;
    if (!registration || !registration.waiting) {
      toast.info('현재 적용할 업데이트가 없습니다.', { autoClose: 3000 });
      return;
    }
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    if (swUpdateToastRef.current && toast.isActive(swUpdateToastRef.current)) {
      toast.update(swUpdateToastRef.current, {
        render: '새로운 버전을 적용하는 중입니다...',
        autoClose: 2000
      });
    } else {
      toast.info('새로운 버전을 적용하는 중입니다...', { autoClose: 2000 });
    }
  }, []);

  useEffect(() => {
    const isInstallPromptSnoozed = () => {
      if (typeof window === 'undefined') {
        return false;
      }
      const stored = window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
      if (!stored) {
        return false;
      }
      const snoozeUntil = Number.parseInt(stored, 10);
      if (!Number.isFinite(snoozeUntil)) {
        window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
        return false;
      }
      if (snoozeUntil > Date.now()) {
        return true;
      }
      window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
      return false;
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setShowInstallShortcut(true);

      if (isInstallPromptSnoozed()) {
        return;
      }

      if (installToastRef.current && toast.isActive(installToastRef.current)) {
        toast.dismiss(installToastRef.current);
      }
      installToastRef.current = toast.info(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#1f2937' }}>
            앱을 홈 화면에 설치해 오프라인에서도 빠르게 접근할 수 있습니다.
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={() => dismissInstallPrompt('later')}
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
              onClick={handleInstallApp}
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
              설치하기
            </button>
          </div>
        </div>,
        {
          position: 'bottom-right',
          autoClose: false,
          closeOnClick: false
        }
      );
    };

    const handleAppInstalled = () => {
      dismissInstallPrompt();
      toast.success('🎉 앱이 홈 화면에 추가되었습니다!', { autoClose: 4000 });
      setShowInstallShortcut(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [handleInstallApp, dismissInstallPrompt]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const checkInstallAvailability = () => {
      try {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
        const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || '');
        setShowInstallShortcut(isMobileDevice && !isStandalone);
      } catch (error) {
        logger.warn('홈 화면 추가 가능 여부 확인 실패', error);
      }
    };

    checkInstallAvailability();

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => checkInstallAvailability();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleDisplayModeChange);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInstallAvailability();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const registration = (event as CustomEvent<ServiceWorkerRegistration>).detail;
      swUpdateRegistrationRef.current = registration;
      if (swUpdateToastRef.current && toast.isActive(swUpdateToastRef.current)) {
        toast.dismiss(swUpdateToastRef.current);
      }
      swUpdateToastRef.current = toast.info(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#1f2937' }}>
            새로운 버전이 준비되었습니다. 업데이트하면 최신 데이터를 바로 받을 수 있습니다.
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={() => {
                if (swUpdateToastRef.current && toast.isActive(swUpdateToastRef.current)) {
                  toast.dismiss(swUpdateToastRef.current);
                  swUpdateToastRef.current = null;
                }
              }}
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
              onClick={requestServiceWorkerUpdate}
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
              지금 업데이트
            </button>
          </div>
        </div>,
        {
          position: 'bottom-right',
          autoClose: false,
          closeOnClick: false
        }
      );
    };

    const handleReady = () => {
      if (swUpdateToastRef.current && toast.isActive(swUpdateToastRef.current)) {
        toast.dismiss(swUpdateToastRef.current);
        swUpdateToastRef.current = null;
      }
      toast.success('✅ 오프라인 모드가 준비되었습니다.', { autoClose: 3500 });
    };

    window.addEventListener('pwaUpdateAvailable', handleUpdateAvailable as EventListener);
    window.addEventListener('pwaReady', handleReady);

    return () => {
      window.removeEventListener('pwaUpdateAvailable', handleUpdateAvailable as EventListener);
      window.removeEventListener('pwaReady', handleReady);
    };
  }, [requestServiceWorkerUpdate]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return;
    }

    const handleControllerChange = () => {
      if (swRefreshingRef.current) {
        return;
      }
      swRefreshingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadStatsInfo = async () => {
      try {
        const info = await getRegionStatsUpdateInfo();
        if (!mounted) return;
        setStatsHasFreshData(info.hasFreshData);
        setStatsUpdatedAt(info.updatedAt);
      } catch (error) {
        logger.warn('통계 최신 정보 조회 실패', error);
        // 에러 발생 시에도 상태를 안전하게 유지
        if (mounted) {
          setStatsHasFreshData(false);
        }
      }
    };

    loadStatsInfo().catch((err) => {
      logger.error('통계 정보 초기 로드 실패', err);
    });
    const interval = window.setInterval(() => {
      loadStatsInfo().catch((err) => {
        logger.error('통계 정보 주기적 로드 실패', err);
      });
    }, 60 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  // reCAPTCHA 전역 초기화
  useEffect(() => {
    const initRecaptcha = async () => {
      try {
        await loadRecaptchaScript();
        logger.log('✅ reCAPTCHA 전역 초기화 완료');
      } catch (error) {
        logger.warn('⚠️ reCAPTCHA 초기화 실패 (제보 시 다시 시도됩니다):', error);
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

        // Firebase Analytics 인증 사용자 설정
        setAnalyticsAuthenticatedUser(user.uid, user.email);
        logLoginEvent(user.providerData[0]?.providerId || 'unknown');

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

  // Guest ID를 Firebase Analytics에 설정
  useEffect(() => {
    if (!currentUser && guestIdInfo) {
      setAnalyticsGuestId(guestIdInfo.guestId);
      logger.log(`👤 Guest ID 활성화: ${guestIdInfo.guestId} (${userType})`);
    }
  }, [currentUser, guestIdInfo, userType]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    onForegroundMessage((payload) => {
      logger.log('[FCM] foreground 메시지 수신:', payload);
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
            logger.log('[FCM] 기존 토큰:', result.token);
          }
        })
        .catch((error) => {
          logger.error('FCM 토큰 동기화 실패:', error);
          // 토큰 동기화 실패 시 사용자에게 알림 (선택적)
          // toast.warning('푸시 알림 설정을 확인해주세요');
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
      setShowPopup(hasUndismissedPopupForToday(popups));
    };

    loadAnnouncements();

    // 5분마다 새로고침
    const interval = setInterval(loadAnnouncements, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (bannerAnnouncements.length === 0 && popupAnnouncements.length === 0) {
      return;
    }
    cacheAnnouncements([...bannerAnnouncements, ...popupAnnouncements]);
  }, [bannerAnnouncements, popupAnnouncements]);

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
          logger.warn('푸시 토큰 해제 실패 (무시 가능):', error);
        }
      }
    }

    // Firebase Analytics 로그아웃 이벤트
    logLogoutEvent();

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

  const handleOpenStatistics = () => {
    setShowStatisticsModal(true);
  };

  const handlePhoneAuthSuccess = () => {
    setShowPhoneAuth(false);
    toast.success('전화번호 인증이 완료되었습니다!');

    // 사용자 정보 새로고침
    const auth = require('firebase/auth').getAuth();
    auth.currentUser?.reload()
      .then(() => {
        setCurrentUser(auth.currentUser);
      })
      .catch((error: Error) => {
        logger.error('사용자 정보 새로고침 실패:', error);
        toast.error('사용자 정보 업데이트에 실패했습니다');
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
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <button
              onClick={() => {
                setShowMobileMenu(false);
                handleOpenStatistics();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/30"
              aria-label="지역별 실종자 통계 보기"
              title={statsUpdatedLabel ? `업데이트: ${statsUpdatedLabel}` : '지역별 실종자 통계 보기'}
            >
              <BarChart3 size={16} />
              <span>통계 보기</span>
              {statsHasFreshData && (
                <span className="ml-1 inline-flex items-center rounded-full bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  New
                </span>
              )}
            </button>
            {currentUser ? (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 rounded-lg text-sm">
                  {isAdmin && <Shield size={14} color="#fbbf24" />}
                  <UserCircle size={16} />
                  <span className="max-w-[100px] truncate">{currentUser.displayName || currentUser.email}</span>
                </div>
                <button
                  onClick={async () => {
                    setShowMobileMenu(false);
                    await handleLogout();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-sm transition-colors hover:bg-red-900"
                >
                  <LogOut size={16} />
                  <span className="text-sm">로그아웃</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800/80 rounded-lg text-sm">
                  <UserCircle size={16} />
                  <span className="text-xs opacity-90">{guestNickname}</span>
                </div>
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowLoginModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-sm transition-colors hover:bg-red-900"
                >
                  <LogIn size={16} />
                  <span className="text-sm">로그인</span>
                </button>
              </>
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

                  {showInstallShortcut && (
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        handleInstallApp();
                      }}
                      className="mt-1 w-full flex items-center justify-between px-4 py-2 hover:bg-gray-100 transition-colors"
                    >
                      <span className="flex items-center gap-3 text-sm">
                        <Home size={18} className="text-red-500" />
                        <span>홈 화면에 추가하기</span>
                      </span>
                      <span className="text-[11px] font-medium text-gray-400">PWA</span>
                    </button>
                  )}

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
                            handleOpenStatistics();
                            setShowMobileMenu(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                          title={statsUpdatedLabel ? `업데이트: ${statsUpdatedLabel}` : '지역별 실종자 통계 보기'}
                        >
                          <span className="flex items-center gap-2">
                            <BarChart3 size={18} />
                            <span>통계 보기</span>
                            {statsHasFreshData && (
                              <span className="inline-flex items-center rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                                New
                              </span>
                            )}
                          </span>
                        </button>
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
                      <div className="flex flex-col">
                        <button
                          onClick={() => {
                            handleOpenStatistics();
                            setShowMobileMenu(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                          title={statsUpdatedLabel ? `업데이트: ${statsUpdatedLabel}` : '지역별 실종자 통계 보기'}
                        >
                          <span className="flex items-center gap-2">
                            <BarChart3 size={18} />
                            <span>통계 보기</span>
                            {statsHasFreshData && (
                              <span className="inline-flex items-center rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                                New
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="px-4 py-2 text-xs text-gray-500">
                          로그인 후 제보, 알림 설정 등 모든 기능을 이용할 수 있습니다.
                        </div>
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
            <button
              onClick={() => setShowGridView(true)}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
              title="실종자 격자 보기 열기"
              aria-label="실종자 격자 보기 열기"
            >
              <LayoutGrid size={18} />
              <span className="hidden lg:inline">격자 보기</span>
            </button>
            <button
              onClick={handleOpenStatistics}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/20"
              aria-label="지역별 실종자 통계 보기"
              title={statsUpdatedLabel ? `업데이트: ${statsUpdatedLabel}` : '지역별 실종자 통계 보기'}
            >
              <BarChart3 size={18} />
              <span className="hidden lg:inline">통계 보기</span>
              {statsHasFreshData && (
                <span className="inline-flex items-center rounded-full bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                  New
                </span>
              )}
            </button>

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
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-800/80 rounded-full">
                  <UserCircle size={18} />
                  <span className="text-sm opacity-90">{guestNickname}</span>
                </div>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded-lg transition-colors"
                >
                  <LogIn size={18} />
                  <span className="text-sm">로그인</span>
                </button>
              </div>
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
      <StatisticsModal
        isOpen={showStatisticsModal}
        onClose={() => setShowStatisticsModal(false)}
      />

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

      <DesktopGridView
        isOpen={showGridView}
        onClose={() => setShowGridView(false)}
        persons={filteredPersons}
      />

      {/* 공지사항 팝업 */}
      {showPopup && popupAnnouncements.length > 0 && (
        <AnnouncementPopup
          announcements={popupAnnouncements}
          onClose={() => setShowPopup(false)}
        />
      )}

      {/* 개발 환경: Guest ID 정보 표시 */}
      {process.env.NODE_ENV === 'development' && guestIdInfo && !currentUser && (
        <div className="fixed bottom-4 left-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-xs font-mono z-50 max-w-xs">
          <div className="font-semibold mb-1">🔍 개발자 정보</div>
          <div>Guest ID: {guestIdInfo.guestId}</div>
          <div>생성: {guestIdInfo.createdAt?.toLocaleString('ko-KR')}</div>
          <div>타입: {userType}</div>
          {guestIdInfo.isTemporary && (
            <div className="text-yellow-400 mt-1">⚠️ 임시 ID (localStorage 접근 불가)</div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
