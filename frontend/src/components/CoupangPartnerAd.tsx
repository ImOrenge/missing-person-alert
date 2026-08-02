import React, { useEffect, useRef } from 'react';
import { logCoupangAdClick, logCoupangAdImpression } from '../services/analyticsService';

interface CoupangPartnerAdProps {
  /** 쿠팡파트너스 대시보드에서 관리할 광고 단위의 고정 ID */
  unitId: string;
  /** 화면상 노출 위치. 예: dashboard_top, missing_detail_bottom */
  placement: string;
  /** 쿠팡파트너스에서 발급한 최종 링크 */
  href: string;
  /** 선택 항목 측정용 상품/콘텐츠 ID */
  productId?: string;
  /** 배너, product_card, text_link 등 */
  creativeType?: string;
  className?: string;
  children: React.ReactNode;
  /** 파트너스 고지 문구를 함께 노출합니다. 기본값은 true입니다. */
  showDisclosure?: boolean;
}

const IMPRESSION_THRESHOLD = 0.5;

export default function CoupangPartnerAd({
  unitId,
  placement,
  href,
  productId,
  creativeType = 'custom',
  className,
  children,
  showDisclosure = true,
}: CoupangPartnerAdProps) {
  const adRef = useRef<HTMLAnchorElement>(null);
  const impressionSentRef = useRef(false);
  const trackingKeyRef = useRef('');

  useEffect(() => {
    if (!href.trim()) return undefined;
    const trackingKey = `${unitId}|${placement}|${creativeType}|${productId ?? ''}`;
    if (trackingKeyRef.current !== trackingKey) {
      trackingKeyRef.current = trackingKey;
      impressionSentRef.current = false;
    }
    const element = adRef.current;
    if (!element) return undefined;

    const trackingParams = { unitId, placement, creativeType, productId };
    const sendImpression = () => {
      if (impressionSentRef.current) return;
      impressionSentRef.current = true;
      logCoupangAdImpression(trackingParams);
    };

    if (typeof IntersectionObserver === 'undefined') {
      sendImpression();
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= IMPRESSION_THRESHOLD)) {
          sendImpression();
          observer.disconnect();
        }
      },
      { threshold: [IMPRESSION_THRESHOLD] }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [creativeType, href, placement, productId, unitId]);

  if (!href.trim()) return null;

  const trackingParams = { unitId, placement, creativeType, productId };

  return (
    <div className={className} data-ad-network="coupang_partners" data-ad-unit-id={unitId} data-ad-placement={placement}>
      <a
        ref={adRef}
        href={href}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        onClick={() => logCoupangAdClick(trackingParams)}
        aria-label="쿠팡 상품 광고 열기"
      >
        {children}
      </a>
      {showDisclosure && (
        <p className="mt-1 text-[10px] leading-4 text-slate-400">
          이 포스팅은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.
        </p>
      )}
    </div>
  );
}
