/**
 * Firebase Analytics 서비스
 * 사용자 행동 추적 및 분석
 */

import { getAnalytics, setUserId, setUserProperties, logEvent } from 'firebase/analytics';
import { firebaseApp } from './firebase';

let analytics: ReturnType<typeof getAnalytics> | null = null;

// Analytics 초기화
try {
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(firebaseApp);
    console.log('✅ Firebase Analytics 초기화 완료');
  }
} catch (error) {
  console.warn('⚠️ Firebase Analytics 초기화 실패:', error);
}

/**
 * 사용자 ID 설정 (로그인 시)
 */
export function setAnalyticsUserId(userId: string | null): void {
  if (!analytics) return;

  try {
    setUserId(analytics, userId);
    console.log(`📊 Analytics 사용자 ID 설정: ${userId}`);
  } catch (error) {
    console.error('❌ Analytics 사용자 ID 설정 실패:', error);
  }
}

/**
 * Guest ID를 사용자 속성으로 설정
 */
export function setAnalyticsGuestId(guestId: string): void {
  if (!analytics) return;

  try {
    setUserProperties(analytics, {
      guest_id: guestId,
      user_type: 'guest'
    });
    console.log(`📊 Analytics Guest ID 설정: ${guestId}`);
  } catch (error) {
    console.error('❌ Analytics Guest ID 설정 실패:', error);
  }
}

/**
 * 인증된 사용자 속성 설정
 */
export function setAnalyticsAuthenticatedUser(userId: string, email: string | null): void {
  if (!analytics) return;

  try {
    setUserId(analytics, userId);
    setUserProperties(analytics, {
      user_type: 'authenticated',
      has_email: email ? 'yes' : 'no'
    });
    console.log(`📊 Analytics 인증 사용자 설정: ${userId}`);
  } catch (error) {
    console.error('❌ Analytics 인증 사용자 설정 실패:', error);
  }
}

/**
 * 페이지 조회 이벤트 로깅
 */
export function logPageView(pageName: string, additionalParams?: Record<string, any>): void {
  if (!analytics) return;

  try {
    logEvent(analytics, 'page_view', {
      page_name: pageName,
      ...additionalParams
    });
  } catch (error) {
    console.error('❌ Analytics 페이지 조회 로깅 실패:', error);
  }
}

/**
 * 커스텀 이벤트 로깅
 */
export function logCustomEvent(eventName: string, params?: Record<string, any>): void {
  if (!analytics) return;

  try {
    logEvent(analytics, eventName, params);
  } catch (error) {
    console.error(`❌ Analytics 이벤트 로깅 실패 (${eventName}):`, error);
  }
}

/**
 * 실종자 조회 이벤트
 */
export function logMissingPersonView(missingPersonId: string, userType: 'guest' | 'authenticated'): void {
  logCustomEvent('missing_person_view', {
    missing_person_id: missingPersonId,
    user_type: userType
  });
}

/**
 * 필터 사용 이벤트
 */
export function logFilterUsage(filterType: string, filterValue: string | string[]): void {
  logCustomEvent('filter_used', {
    filter_type: filterType,
    filter_value: Array.isArray(filterValue) ? filterValue.join(',') : filterValue
  });
}

/**
 * 제보 제출 이벤트
 */
export function logReportSubmission(reportType: 'api' | 'user_report'): void {
  logCustomEvent('report_submitted', {
    report_type: reportType
  });
}

/**
 * 로그인 이벤트
 */
export function logLoginEvent(method: string): void {
  logCustomEvent('login', {
    method
  });
}

/**
 * 로그아웃 이벤트
 */
export function logLogoutEvent(): void {
  logCustomEvent('logout', {});
}
