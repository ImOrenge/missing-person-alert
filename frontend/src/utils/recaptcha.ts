/**
 * Google reCAPTCHA Enterprise 유틸리티
 * 자동입력 방지 및 봇 공격 차단
 */

// reCAPTCHA Enterprise 사이트 키 (환경변수에서 로드)
const RECAPTCHA_SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY || '6Lc5_-MrAAAAAPrws4mNW7MeSgMfPfDP8hxrPhpd';

/**
 * reCAPTCHA 스크립트 로드
 * HTML head에 이미 포함되어 있으므로 ready 상태만 확인
 */
export const loadRecaptchaScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // reCAPTCHA Enterprise가 이미 로드되어 있는지 확인
    if (window.grecaptcha?.enterprise?.ready) {
      window.grecaptcha.enterprise.ready(() => {
        console.log('✅ reCAPTCHA Enterprise 준비 완료');
        resolve();
      });
      return;
    }

    // 스크립트가 로드될 때까지 대기 (최대 10초)
    let attempts = 0;
    const maxAttempts = 50; // 10초 (200ms * 50)

    const checkInterval = setInterval(() => {
      attempts++;

      if (window.grecaptcha?.enterprise?.ready) {
        clearInterval(checkInterval);
        window.grecaptcha.enterprise.ready(() => {
          console.log('✅ reCAPTCHA Enterprise 로드 완료');
          resolve();
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('❌ reCAPTCHA 로드 시간 초과');
        reject(new Error('reCAPTCHA 로드 시간이 초과되었습니다'));
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
  if (!RECAPTCHA_SITE_KEY) {
    console.warn('⚠️ reCAPTCHA 사이트 키가 설정되지 않았습니다');
    throw new Error('reCAPTCHA가 설정되지 않았습니다');
  }

  try {
    // reCAPTCHA Enterprise 스크립트가 로드되지 않았으면 대기
    if (!window.grecaptcha?.enterprise?.ready) {
      await loadRecaptchaScript();
    }

    return new Promise((resolve, reject) => {
      if (window.grecaptcha?.enterprise?.ready) {
        window.grecaptcha.enterprise.ready(async () => {
          try {
            if (window.grecaptcha?.enterprise?.execute) {
              const token = await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
              console.log(`✅ reCAPTCHA Enterprise 토큰 생성 완료 (action: ${action})`);
              resolve(token);
            } else {
              reject(new Error('reCAPTCHA Enterprise execute를 찾을 수 없습니다'));
            }
          } catch (error) {
            console.error('❌ reCAPTCHA 토큰 생성 실패:', error);
            reject(new Error('보안 인증에 실패했습니다'));
          }
        });
      } else {
        reject(new Error('reCAPTCHA Enterprise가 준비되지 않았습니다'));
      }
    });
  } catch (error) {
    console.error('❌ reCAPTCHA 실행 실패:', error);
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
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}
