import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { UserCircle, Plus, FileText, Shield } from 'lucide-react';
import EmergencyMap from './components/EmergencyMap';
import Sidebar from './components/Sidebar';
import FilterPanel from './components/FilterPanel';
import AdminDashboard from './components/AdminDashboard';
import LoginModal from './components/LoginModal';
import UserProfileModal from './components/UserProfileModal';
import AnnouncementBanner from './components/AnnouncementBanner';
import AnnouncementPopup from './components/AnnouncementPopup';
import StatisticsModal from './components/StatisticsModal';
import { useEmergencyStore } from './stores/emergencyStore';
import { ToastContainer, toast } from 'react-toastify';
import { onAuthChange, logout as firebaseLogout } from './services/firebase';
import { EMPTY_ADMIN_ROLES, getAdminRoles, hasAnyAdminRole } from './utils/adminUtils';
import type { AdminRoles } from './utils/adminUtils';
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
import { setAnalyticsGuestId, setAnalyticsAuthenticatedUser, logCustomEvent, logLoginEvent, logLogoutEvent, logMissingPersonView } from './services/analyticsService';
import { logger } from './utils/logger';
import { cacheMissingPersons, hydrateMissingPersonsFromCache, cacheAnnouncements } from './utils/offlineCache';
import { hasUndismissedPopupForToday } from './utils/announcementPopupStorage';
import type { MissingPerson, MissingPersonStatus } from './types';
import { useActiveSessionTracker } from './hooks/useActiveSessionTracker';
import { DesktopGridView } from './components/DesktopGridView';
import DashboardHome from './components/DashboardHome';
import CommunityFeed from './components/CommunityFeed';
import PageShell from './components/PageShell';
import NewsPage from './components/news/NewsPage';
import { useNewsFeed } from './hooks/useNewsFeed';
import { getPathForView, getViewFromLocation } from './app-routing/route-contract';
import type { AppView } from './app-routing/route-contract';
import { useUiFeatureFlags } from './hooks/useUiFeatureFlags';
import EmergencySiteAlert from './components/alerts/EmergencySiteAlert';
import MobileNavigation from './components/layout/MobileNavigation';
import SearchPage from './features/search/SearchPage';
import ExplorePage from './features/explore/ExplorePage';
import ReportWizard from './features/reports/ReportWizard';
import OwnReportsPage from './features/reports/OwnReportsPage';
import ReportsModerationV2 from './features/admin/reports/ReportsModerationV2';
import AlertSubscriptionsPage from './features/alerts/AlertSubscriptionsPage';
import DashboardPersonalizationPanel from './features/dashboard/DashboardPersonalizationPanel';
import { useSiteBanners } from './hooks/useSiteBanners';
import BannerOperationsV2 from './features/admin/banners/BannerOperationsV2';
import ProfileHubPage from './features/profile/ProfileHubPage';
import PrivacyPolicyPage from './features/privacy/PrivacyPolicyPage';
import GlobalHeader from './components/layout/GlobalHeader';
import PublicReportsPage from './features/reports/PublicReportsPage';

const GRID_VIEW_PREF_KEY = 'missing_person_desktop_grid_view';
const INSTALL_PROMPT_DISMISSED_KEY = 'missing_person_install_prompt_snooze_until';
const INSTALL_PROMPT_SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function App() {
  const [activeView, setActiveView] = useState<AppView>(getViewFromLocation);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRoles, setAdminRoles] = useState<AdminRoles>(EMPTY_ADMIN_ROLES);
  const alertsEnabled = true;
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
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number | undefined>(undefined);
  const [showGridView, setShowGridView] = useState(false);
  const [communityPersonId, setCommunityPersonId] = useState<string | null>(null);
  const dashboardNews = useNewsFeed({ limit: 5, enabled: activeView === 'dashboard' });
  const { flags: uiFlags } = useUiFeatureFlags();
  const siteBanners = useSiteBanners(uiFlags.emergency_banner_v2_enabled);

  const { hasLoadedPersons } = useApiData();
  useActiveSessionTracker(currentUser);

  const missingPersons = useEmergencyStore(state => state.missingPersons);
  const setMissingPersons = useEmergencyStore(state => state.setMissingPersons);
  const filteredPersons = useEmergencyStore(state => state.getFilteredPersons());
  const setSelectedPersonId = useEmergencyStore(state => state.setSelectedPersonId);
  const setHoveredPersonId = useEmergencyStore(state => state.setHoveredPersonId);
  const updateFilters = useEmergencyStore(state => state.updateFilters);
  const newPersonAlerts = useEmergencyStore(state => state.newPersonAlerts);
  const shiftNewPersonAlert = useEmergencyStore(state => state.shiftNewPersonAlert);

  const {
    status: pushStatus,
    isProcessing: isPushProcessing,
    enablePush,
    disablePush,
    syncExistingToken
  } = usePushNotifications(currentUser);
  const { guestIdInfo, userType } = useGuestId(currentUser);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);
  const pendingPersonReasonRef = useRef<'deeplink' | 'notification' | null>(null);
  const newAlertProcessingRef = useRef(false);
  const activeAlertToastIdRef = useRef<React.ReactText | null>(null);
  const alertsEnabledRef = useRef(alertsEnabled);
  const newPersonAlertCount = newPersonAlerts.length;
  const emergencyAnnouncement = useMemo(() => siteBanners.find((banner) => banner.kind === 'emergency'), [siteBanners]);
  const informationBannerAnnouncements = useMemo(
    () => bannerAnnouncements.filter((announcement) => announcement.kind !== 'emergency'),
    [bannerAnnouncements]
  );

  const navigateTo = useCallback((view: AppView, personId?: string, replace = false) => {
    const nextUrl = getPathForView(view, personId);
    if (typeof window !== 'undefined') {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method]({}, document.title, nextUrl);
    }
    setCommunityPersonId(view === 'community' ? personId || null : null);
    setActiveView(view);
  }, []);

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
    if (typeof window === 'undefined') return;

    const syncLocation = () => {
      const nextView = getViewFromLocation();
      const params = new URLSearchParams(window.location.search);
      setActiveView(nextView);
      setCommunityPersonId(nextView === 'community' ? params.get('personId') : null);
      const personId = params.get('personId');
      if (personId && (nextView === 'map' || nextView === 'community')) {
        setPendingPersonId(personId);
        pendingPersonReasonRef.current = 'deeplink';
      }
    };

    syncLocation();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_source') !== 'organic' || params.get('utm_medium') !== 'seo') return;
    const personId = params.get('personId') || '';
    const sessionKey = `seo_landing:${personId || window.location.pathname}`;
    if (window.sessionStorage.getItem(sessionKey)) return;
    logCustomEvent('seo_app_landing', {
      missing_person_id: personId,
      campaign: params.get('utm_campaign') || 'missing_detail',
      content: params.get('utm_content') || 'unknown',
      landing_path: window.location.pathname
    });
    window.sessionStorage.setItem(sessionKey, '1');
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const indexable = activeView === 'dashboard' || activeView === 'map';
    const canonicalPath = getPathForView(activeView).split('?')[0];
    const titles: Partial<Record<AppView, string>> = {
      dashboard: 'MissingAlert | 실종자 공식정보·지도·제보',
      search: '실종자 통합 검색 | MissingAlert',
      map: '전국 실종자 지도 | MissingAlert',
      reports: '내 제보 | MissingAlert',
      report: '안전한 제보 접수 | MissingAlert',
      alerts: '지역·사건 알림 설정 | MissingAlert',
      admin: '운영자 검토 | MissingAlert',
      profile: '내 정보 | MissingAlert',
      privacy: '개인정보 처리방침 | MissingAlert',
    };
    document.title = titles[activeView] || 'MissingAlert';
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    robots?.setAttribute('content', indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow,noarchive');
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    canonical?.setAttribute('href', `https://missingalert.kr${canonicalPath}`);
  }, [activeView]);

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
    logMissingPersonView(target.id, userType);

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
  }, [pendingPersonId, missingPersons, setSelectedPersonId, setHoveredPersonId, userType]);

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
      navigateTo('report');
    } else {
      setShowLoginModal(true);
    }

    if (window.history && window.history.replaceState) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [currentUser, navigateTo]);

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
        if (payload.intent === 'community-reply') {
          navigateTo('community', typeof payload.missingPersonId === 'string' ? payload.missingPersonId : undefined);
          return;
        }
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
  }, [navigateTo]);

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
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [handleInstallApp, dismissInstallPrompt]);

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
        setStatsUpdatedAt(info.updatedAt);
      } catch (error) {
        logger.warn('통계 최신 정보 조회 실패', error);
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

  // Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setCurrentUser(user);
      if (user) {
        const roles = await getAdminRoles(user);
        const adminAccess = hasAnyAdminRole(roles);
        setAdminRoles(roles);
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
        if (!user.phoneNumber && !uiFlags.reporting_flow_v2_enabled) {
          // 로그인 직후에만 (1초 후에 체크)
          setTimeout(() => {
            const isFirstLogin = sessionStorage.getItem('phone_prompt_shown') !== 'true';
            if (isFirstLogin) {
              navigateTo('profile');
              sessionStorage.setItem('phone_prompt_shown', 'true');
              toast.info('📱 실종자 제보를 위해 전화번호 인증이 필요합니다', { autoClose: 5000 });
            }
          }, 1000);
        }
      } else {
        setAdminRoles(EMPTY_ADMIN_ROLES);
        setIsAdmin(false);
        // 로그아웃 시 세션 스토리지 초기화
        sessionStorage.removeItem('phone_prompt_shown');
      }
    });

    return () => unsubscribe();
  }, [navigateTo, uiFlags.reporting_flow_v2_enabled]);

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

    if (uiFlags.reporting_flow_v2_enabled) {
      navigateTo('report');
      return;
    }

    // 전화번호 인증 확인
    if (!currentUser.phoneNumber) {
      // UserProfileModal을 띄워서 전화번호 인증 유도
      navigateTo('profile');
      toast.warning('📱 실종자 제보를 위해 먼저 전화번호 인증이 필요합니다', { autoClose: 5000 });
      return;
    }

    navigateTo('report');
  };

  const handleOpenStatistics = () => {
    navigateTo('statistics');
  };

  const handleOpenMap = useCallback((personId?: string) => {
    if (personId) {
      setSelectedPersonId(personId);
      setHoveredPersonId(personId);
    }
    setShowSidebar(true);
    navigateTo('map', personId);
  }, [navigateTo, setHoveredPersonId, setSelectedPersonId]);

  const handleOpenSearch = useCallback((query?: string) => {
    const normalizedQuery = query?.trim().slice(0, 80) || '';
    const sensitiveQuery = /(?:\b\d{2,3}-?\d{3,4}-?\d{4}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{6}-?[1-4]\d{6}\b)/.test(normalizedQuery);
    const nextUrl = normalizedQuery && !sensitiveQuery ? `/search?q=${encodeURIComponent(normalizedQuery)}` : '/search';
    if (typeof window !== 'undefined') {
      window.history.pushState(sensitiveQuery ? { transientSearchQuery: normalizedQuery } : {}, document.title, nextUrl);
    }
    setCommunityPersonId(null);
    setActiveView('search');
  }, []);

  const handleOpenCommunity = useCallback((personId?: string) => {
    navigateTo('community', personId);
  }, [navigateTo]);

  const handleOpenNews = useCallback((articleId?: string) => {
    navigateTo('news', articleId);
  }, [navigateTo]);

  const handleOpenCaseNews = useCallback((personId: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, document.title, `/news?caseId=${encodeURIComponent(personId)}`);
    }
    setCommunityPersonId(null);
    setActiveView('news');
  }, []);

  const handleOpenRegion = useCallback((region: string) => {
    updateFilters({ regions: [region] });
    setShowSidebar(true);
    navigateTo('map');
  }, [navigateTo, updateFilters]);

  const handleOpenGrid = useCallback(() => {
    if (uiFlags.unified_explorer_enabled) {
      window.history.pushState({}, document.title, '/map?view=cards');
      setActiveView('map');
      return;
    }
    setShowGridView(true);
  }, [uiFlags.unified_explorer_enabled]);

  const handleOpenPublicReport = useCallback((reportId: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, document.title, `/map?publicReportId=${encodeURIComponent(reportId)}`);
    }
    setCommunityPersonId(null);
    setActiveView('map');
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50">
      {uiFlags.emergency_banner_v2_enabled && emergencyAnnouncement && (
        <EmergencySiteAlert announcement={emergencyAnnouncement} />
      )}
      <GlobalHeader
        activeView={activeView}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onNavigate={(view) => navigateTo(view)}
        onReport={handleReportClick}
        onLogin={() => setShowLoginModal(true)}
        onLogout={handleLogout}
      />
      {activeView === 'dashboard' ? (
        <DashboardHome
          persons={missingPersons}
          hasLoadedPersons={hasLoadedPersons}
          announcements={[...bannerAnnouncements, ...popupAnnouncements]}
          currentUser={currentUser}
          statsUpdatedLabel={statsUpdatedLabel}
          pushStatus={pushStatus}
          newsItems={dashboardNews.items}
          newsLoading={dashboardNews.loading}
          newsError={dashboardNews.error}
          reportMapLayerEnabled={uiFlags.reports_map_layer_enabled}
          onOpenSearch={handleOpenSearch}
          onOpenMap={handleOpenMap}
          onOpenCommunity={handleOpenCommunity}
          onOpenNews={handleOpenNews}
          onOpenCaseNews={handleOpenCaseNews}
          onRetryNews={dashboardNews.reload}
          onOpenRegion={handleOpenRegion}
          onOpenStatistics={handleOpenStatistics}
          onOpenGrid={handleOpenGrid}
          onOpenReport={handleReportClick}
          onOpenAlerts={() => navigateTo('alerts')}
          onOpenMyReports={() => navigateTo('reports')}
          onOpenPublicReports={() => navigateTo('public-reports')}
          onOpenLogin={() => setShowLoginModal(true)}
          onOpenProfile={() => navigateTo('profile')}
          onEnablePush={handleEnablePush}
          hideLegacyMobileNav={uiFlags.mobile_nav_v2_enabled}
          personalizationEnabled={uiFlags.dashboard_personalization_enabled}
        />
      ) : activeView === 'search' ? (
        <PageShell
          title="통합 검색"
          description="공식 사건, 운영 검토를 마친 공개 제보와 관련 뉴스를 한 곳에서 찾습니다."
        >
          <SearchPage enabled={uiFlags.unified_search_enabled} onOpenMap={() => handleOpenMap()} />
        </PageShell>
      ) : activeView === 'map' && uiFlags.unified_explorer_enabled ? (
        <PageShell
          title="실종자 통합 탐색"
          description="지도, 목록, 카드 보기를 전환하며 공식 공개 수색정보를 확인하세요."
        >
          <ExplorePage persons={filteredPersons} reportMapLayerEnabled={uiFlags.reports_map_layer_enabled} onOpenCommunity={handleOpenCommunity} onOpenCaseNews={handleOpenCaseNews} />
        </PageShell>
      ) : activeView === 'public-reports' ? (
        <PageShell
          eyebrow="PUBLIC REPORTS / SAFETY REVIEW"
          title="검토된 사용자 제보"
          description="운영 검토를 마친 공개 제보만 확인하고, 지도와 공식 사건 정보로 이어서 살펴보세요."
          assurances={['운영 검토 완료', '개인정보 최소화']}
          action={<button type="button" onClick={handleReportClick}><Plus size={15} />제보하기</button>}
        >
          <PublicReportsPage enabled={uiFlags.reports_public_timeline_enabled && uiFlags.reports_map_layer_enabled} onOpenMap={handleOpenPublicReport} onStartReport={handleReportClick} />
        </PageShell>
      ) : activeView === 'community' ? (
        <PageShell
          eyebrow="COMMUNITY FEED"
          title="함께 확인하고, 함께 알려주세요"
          description="실종자별 목격 정보·문의·응원 메시지를 한곳에서 확인하고 답글을 남길 수 있습니다."
          assurances={['공식 채널 교차 확인', '개인정보 공개 금지']}
        >
          <CommunityFeed
            persons={missingPersons}
            currentUser={currentUser}
            isAdmin={isAdmin}
            initialMissingPersonId={communityPersonId}
            onBack={() => navigateTo('dashboard')}
            onOpenMap={handleOpenMap}
            onOpenLogin={() => setShowLoginModal(true)}
          />
        </PageShell>
      ) : activeView === 'news' ? (
        <PageShell
          title="관련 뉴스"
          description="NAVER에서 “실종”으로 검색한 뉴스 결과를 시간순으로 확인하세요."
        >
          <NewsPage />
        </PageShell>
      ) : activeView === 'statistics' ? (
        <PageShell
          title="지역 통계"
          description="기간과 지역별 실종자 현황을 지도와 차트로 확인하세요."
        >
          <StatisticsModal isOpen onClose={() => navigateTo('dashboard')} isPage />
        </PageShell>
      ) : activeView === 'profile' || activeView === 'reports' || activeView === 'alerts' ? (
        <PageShell
          title="내 프로필"
          description="내 정보, 제보 처리 상태와 관심 알림을 한곳에서 관리하세요."
        >
          <ProfileHubPage activeSection={activeView} onNavigate={(section) => navigateTo(section)}>
            {activeView === 'alerts' ? (
              currentUser ? <AlertSubscriptionsPage pushStatus={pushStatus} pushProcessing={isPushProcessing} enablePush={enablePush} disablePush={disablePush} /> : (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><h2 className="text-xl font-black">로그인이 필요합니다</h2><p className="mt-2 text-sm text-slate-500">관심 알림을 관리하려면 로그인해주세요.</p><button type="button" onClick={() => setShowLoginModal(true)} className="mt-5 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">로그인</button></div>
              )
            ) : activeView === 'reports' ? (
              currentUser ? (uiFlags.reporting_flow_v2_enabled ? <OwnReportsPage /> : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
                <FileText className="mx-auto text-amber-500" size={44} />
                <h2 className="mt-4 text-xl font-black text-slate-950">제보 시스템 전환 준비 중</h2>
                <p className="mt-2 text-sm text-slate-600">기존 제보 경로는 개인정보 보호를 위해 종료되었습니다. 안전한 신규 제보 시스템이 활성화되면 이곳에서 처리 상태를 확인할 수 있습니다.</p>
              </div>
              )) : (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><FileText className="mx-auto text-slate-300" size={44} /><h2 className="mt-4 text-xl font-black text-slate-950">로그인이 필요합니다</h2><p className="mt-2 text-sm text-slate-500">내 제보를 확인하려면 로그인해주세요.</p><button type="button" onClick={() => setShowLoginModal(true)} className="mt-5 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">로그인</button></div>
              )
            ) : currentUser ? (
              <>{uiFlags.dashboard_personalization_enabled && <DashboardPersonalizationPanel user={currentUser} />}<UserProfileModal isOpen onClose={() => navigateTo('dashboard')} isPage /></>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><UserCircle className="mx-auto text-slate-300" size={44} /><h2 className="mt-4 text-xl font-black text-slate-950">로그인이 필요합니다</h2><p className="mt-2 text-sm text-slate-500">내 정보를 관리하려면 로그인해주세요.</p><button type="button" onClick={() => setShowLoginModal(true)} className="mt-5 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">로그인</button></div>
            )}
          </ProfileHubPage>
        </PageShell>
      ) : activeView === 'admin' ? (
        <PageShell
          title="관리자"
          description="제보·사용자·공지·댓글 신고를 관리합니다."
        >
          {isAdmin ? (
            <>{uiFlags.reporting_flow_v2_enabled && <ReportsModerationV2 roles={adminRoles} adminEnabled={uiFlags.reports_admin_enabled} publicApprovalEnabled={uiFlags.reports_public_timeline_enabled} />}{uiFlags.admin_banner_v2_enabled && <BannerOperationsV2 roles={adminRoles} />}<AdminDashboard isOpen onClose={() => navigateTo('dashboard')} isPage /></>
          ) : (
            <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
              <Shield className="mx-auto text-red-300" size={44} />
              <h2 className="mt-4 text-xl font-black text-slate-950">{currentUser ? '관리자 권한이 필요합니다' : '관리자 로그인이 필요합니다'}</h2>
              <p className="mt-2 text-sm text-slate-500">{currentUser ? '현재 계정에는 이 페이지에 접근할 수 있는 역할이 없습니다.' : '승인된 관리자 계정으로 로그인하면 제보 검토 화면으로 돌아옵니다.'}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {!currentUser && <button type="button" onClick={() => setShowLoginModal(true)} className="rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">관리자 로그인</button>}
                <button type="button" onClick={() => navigateTo('dashboard')} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">현황으로 돌아가기</button>
              </div>
            </div>
          )}
        </PageShell>
      ) : activeView === 'privacy' ? (
        <PageShell
          title="개인정보 처리방침"
          description="서비스가 처리하는 정보, 보호 조치와 이용자의 권리를 공개합니다."
        >
          <PrivacyPolicyPage />
        </PageShell>
      ) : activeView === 'report' ? (
        <PageShell
          title="실종자 제보"
          description="확인 가능한 정보와 위치를 정확히 남겨주세요."
        >
          {currentUser ? (uiFlags.reporting_flow_v2_enabled ? <ReportWizard onComplete={() => navigateTo('reports')} mediaEnabled={uiFlags.reports_media_enabled} submissionEnabled={uiFlags.reports_submission_enabled} /> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"><h2 className="text-xl font-black text-slate-950">제보 접수 준비 중</h2><p className="mt-2 text-sm text-slate-600">안전한 검토·개인정보 보호 절차를 갖춘 신규 제보 시스템을 준비하고 있습니다.</p></div>) : <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-black text-slate-950">로그인이 필요합니다</h2><button type="button" onClick={() => setShowLoginModal(true)} className="mt-5 rounded-lg bg-[#10213a] px-4 py-2 text-sm font-bold text-white">로그인</button></div>}
        </PageShell>
      ) : (
        <>
      {/* 상단 헤더 */}

      {/* 메인 콘텐츠 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
          <div className="flex items-center gap-2"><strong className="text-sm text-slate-900">실종자 지도</strong><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{filteredPersons.length}명</span></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowSidebar((visible) => !visible)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{showSidebar ? '목록 닫기' : '목록 열기'}</button><button type="button" onClick={() => setShowFilters((visible) => !visible)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">필터</button><button type="button" onClick={handleOpenGrid} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">격자 보기</button><button type="button" onClick={handleOpenStatistics} className="rounded-lg bg-[#10213a] px-3 py-2 text-xs font-black text-white">지역 통계</button></div>
        </div>
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* 사이드바 */}
        {showSidebar && (
          <Sidebar
            onShowFilters={() => setShowFilters(!showFilters)}
            showFilters={showFilters}
          />
        )}

        {/* 지도 */}
        <div className="flex-1 relative">
          <EmergencyMap onOpenCommunity={handleOpenCommunity} onOpenCaseNews={handleOpenCaseNews} />
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
        </>
      )}

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

      {uiFlags.mobile_nav_v2_enabled && (
        <MobileNavigation
          activeView={activeView}
          onHome={() => navigateTo('dashboard')}
          onSearch={() => navigateTo('search')}
          onMap={() => handleOpenMap()}
          onReport={handleReportClick}
          onProfile={() => currentUser ? navigateTo('profile') : setShowLoginModal(true)}
        />
      )}

      {/* 공지사항 배너 (하단) */}
      {activeView === 'map' && informationBannerAnnouncements.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <AnnouncementBanner
            announcement={informationBannerAnnouncements[currentAnnouncementIndex % informationBannerAnnouncements.length]}
            onPrev={() => setCurrentAnnouncementIndex((prev) => (prev - 1 + informationBannerAnnouncements.length) % informationBannerAnnouncements.length)}
            onNext={() => setCurrentAnnouncementIndex((prev) => (prev + 1) % informationBannerAnnouncements.length)}
          />
        </div>
      )}

      <DesktopGridView
        isOpen={!uiFlags.unified_explorer_enabled && showGridView}
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
