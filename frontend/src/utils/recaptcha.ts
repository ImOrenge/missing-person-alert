/**
 * Google reCAPTCHA Enterprise 유틸리티
 * 자동입력 방지 및 봇 공격 차단
 */

const RECAPTCHA_SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY ?? '';
const RECAPTCHA_SCRIPT_URL = 'https://www.google.com/recaptcha/enterprise.js';
const RECAPTCHA_SCRIPT_ID = 'recaptcha-enterprise-script';

const assertSiteKey = (): string => {
  if (!RECAPTCHA_SITE_KEY) {
    throw new Error('reCAPTCHA 사이트 키가 설정되지 않았습니다');
  }
  return RECAPTCHA_SITE_KEY;
};

const ensureScriptElement = () => {
  const siteKey = assertSiteKey();
  const desiredSrc = `${RECAPTCHA_SCRIPT_URL}?render=${siteKey}`;

  const currentScript = document.getElementById(RECAPTCHA_SCRIPT_ID) as HTMLScriptElement | null;
  if (currentScript) {
    if (currentScript.src !== desiredSrc) {
      currentScript.remove();
    } else {
      return currentScript;
    }
  }

  const staleScript = document.querySelector<HTMLScriptElement>(
    `script[src^="${RECAPTCHA_SCRIPT_URL}"]`
  );
  if (staleScript) {
    staleScript.remove();
  }

  const script = document.createElement('script');
  script.id = RECAPTCHA_SCRIPT_ID;
  script.src = desiredSrc;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  return script;
};

/**
 * reCAPTCHA Enterprise 스크립트 로드
 * 필요한 경우 스크립트를 동적으로 로드하고 ready 상태를 확인합니다
 */
export const loadRecaptchaScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      ensureScriptElement();
    } catch (error) {
      reject(error instanceof Error ? error : new Error('reCAPTCHA 설정 오류'));
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 약 10초 대기 (200ms * 50)

    const checkReady = () => {
      attempts += 1;

      if (window.grecaptcha?.enterprise?.ready) {
        window.grecaptcha.enterprise.ready(() => {
          console.log('✅ reCAPTCHA Enterprise 로드 완료');
          resolve();
        });
        return true;
      }

      if (attempts >= maxAttempts) {
        console.error('❌ reCAPTCHA 로드 시간 초과');
        reject(new Error('reCAPTCHA 로드 시간이 초과되었습니다'));
        return true;
      }

      return false;
    };

    if (checkReady()) {
      return;
    }

    const interval = setInterval(() => {
      if (checkReady()) {
        clearInterval(interval);
      }
    }, 200);
  });
};

/**
 * reCAPTCHA Enterprise 토큰 생성
 * @param action 액션 이름 (예: 'LOGIN', 'REPORT_SUBMIT', 'SIGNUP')
 * @returns reCAPTCHA 토큰
 */
export const executeRecaptcha = async (action: string): Promise<string> => {
  const siteKey = assertSiteKey();

  if (!window.grecaptcha?.enterprise?.ready) {
    await loadRecaptchaScript();
  } else {
    await new Promise<void>((resolve) => {
      window.grecaptcha?.enterprise?.ready(resolve);
    });
  }

  try {
    const executor = window.grecaptcha?.enterprise?.execute ?? window.grecaptcha?.execute;
    if (!executor) {
      throw new Error('reCAPTCHA execute 함수를 찾을 수 없습니다');
    }

    const token = await executor(siteKey, { action });
    console.log(`✅ reCAPTCHA Enterprise 토큰 생성 완료 (action: ${action})`);
    return token;
  } catch (error) {
    console.error('❌ reCAPTCHA 토큰 생성 실패:', error);
    throw new Error('보안 인증에 실패했습니다');
  }
};

/**
 * reCAPTCHA 배지 숨기기
 */
export const hideRecaptchaBadge = () => {
  const badge = document.querySelector('.grecaptcha-badge') as HTMLElement;
  if (badge) {
    badge.style.visibility = 'hidden';
  }
};

/**
 * reCAPTCHA 배지 표시
 */
export const showRecaptchaBadge = () => {
  const badge = document.querySelector('.grecaptcha-badge') as HTMLElement;
  if (badge) {
    badge.style.visibility = 'visible';
  }
};

/**
 * TypeScript 타입 정의 - reCAPTCHA Enterprise
 */
declare global {
  interface Window {
    grecaptcha?: {
      ready?: (callback: () => void) => void;
      execute?: (siteKey: string, options: { action: string }) => Promise<string>;
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}
