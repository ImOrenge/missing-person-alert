/**
 * Firebase Analytics 서비스
 * 사용자 행동 추적 및 분석
 */

import {
  getAnalytics,
  isSupported,
  setUserId,
  setUserProperties,
  logEvent,
  type Analytics,
} from 'firebase/analytics';
import { firebaseApp } from './firebase';
import {
  serializePublicImpactEvent,
  type PublicImpactEventInput,
  type PublicImpactEventName,
  type SerializedPublicImpactEvent,
} from './analytics/events';

let analyticsPromise: Promise<Analytics | null> | null = null;

const getAnalyticsInstance = (): Promise<Analytics | null> => {
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = (async () => {
    const localAnalyticsEnabled = process.env.REACT_APP_ANALYTICS_DEBUG_ENABLED === 'true'
      || process.env.REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED === 'true';
    if (process.env.NODE_ENV !== 'production' && !localAnalyticsEnabled) return null;
    if (typeof window === 'undefined' || !(await isSupported())) return null;
    try {
      const instance = getAnalytics(firebaseApp);
      console.log('✅ Firebase Analytics 초기화 완료');
      return instance;
    } catch (error) {
      console.warn('⚠️ Firebase Analytics 초기화 실패:', error);
      return null;
    }
  })();
  return analyticsPromise;
};

const withAnalytics = (callback: (instance: Analytics) => void): void => {
  void getAnalyticsInstance().then((instance) => {
    if (!instance) return;
    try {
      callback(instance);
    } catch (error) {
      console.error('❌ Firebase Analytics 호출 실패:', error);
    }
  }).catch((error) => {
    console.warn('⚠️ Firebase Analytics 지원 여부 확인 실패:', error);
  });
};

/**
 * 사용자 ID 설정 (로그인 시)
 */
export function setAnalyticsUserId(userId: string | null): void {
  withAnalytics((instance) => setUserId(instance, userId));
}

/**
 * Guest ID를 사용자 속성으로 설정
 */
export function setAnalyticsGuestId(guestId: string): void {
  withAnalytics((instance) => {
    setUserProperties(instance, {
      guest_id: guestId,
      user_type: 'guest'
    });
  });
}

/**
 * 인증된 사용자 속성 설정
 */
export function setAnalyticsAuthenticatedUser(userId: string, email: string | null): void {
  withAnalytics((instance) => {
    setUserId(instance, userId);
    setUserProperties(instance, {
      user_type: 'authenticated',
      has_email: email ? 'yes' : 'no'
    });
  });
}

/**
 * 페이지 조회 이벤트 로깅
 */
export function logPageView(pageName: string, additionalParams?: Record<string, any>): void {
  withAnalytics((instance) => {
    logEvent(instance, 'page_view', {
      page_name: pageName,
      ...additionalParams
    });
  });
}

/**
 * 커스텀 이벤트 로깅
 */
export function logCustomEvent(eventName: string, params?: Record<string, any>): void {
  withAnalytics((instance) => logEvent(instance, eventName, params));
}

/**
 * Public Impact 핵심 이벤트. production에서는 명시적 feature flag로만 활성화한다.
 */
export function logPublicImpactEvent(
  eventName: PublicImpactEventName,
  input: PublicImpactEventInput,
): SerializedPublicImpactEvent {
  const event = serializePublicImpactEvent(eventName, input);
  const enabled = process.env.REACT_APP_PUBLIC_IMPACT_ANALYTICS_ENABLED === 'true';

  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[PublicImpact Analytics] ${event.name} ${JSON.stringify(event.params)}`);
  }
  if (enabled) logCustomEvent(event.name, event.params);
  return event;
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

export interface CoupangAdTrackingParams {
  unitId: string;
  placement: string;
  creativeType?: string;
  productId?: string;
}

const toCoupangAdParams = ({ unitId, placement, creativeType, productId }: CoupangAdTrackingParams) => ({
  ad_network: 'coupang_partners',
  ad_unit_id: unitId,
  ad_placement: placement,
  ...(creativeType ? { ad_creative_type: creativeType } : {}),
  ...(productId ? { product_id: productId } : {})
});

/** 쿠팡파트너스 광고 단위가 화면에 충분히 노출된 시점을 기록합니다. */
export function logCoupangAdImpression(params: CoupangAdTrackingParams): void {
  logCustomEvent('affiliate_ad_impression', toCoupangAdParams(params));
}

/** 쿠팡파트너스 광고 단위의 outbound 클릭을 기록합니다. */
export function logCoupangAdClick(params: CoupangAdTrackingParams): void {
  logCustomEvent('affiliate_ad_click', toCoupangAdParams(params));
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
