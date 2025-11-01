/**
 * 환경별 로깅 유틸리티
 * 프로덕션 환경에서는 로그를 출력하지 않습니다.
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  error: (...args: any[]) => {
    // 에러는 프로덕션에서도 표시 (추후 에러 리포팅 서비스로 전송 가능)
    console.error(...args);
  },

  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};

// 백엔드용 로거 (CommonJS)
export const createLogger = (context: string) => ({
  log: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${context}]`, ...args);
    }
  },

  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[${context}]`, ...args);
    }
  },

  warn: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${context}]`, ...args);
    }
  },

  error: (...args: any[]) => {
    console.error(`[${context}]`, ...args);
  }
});
