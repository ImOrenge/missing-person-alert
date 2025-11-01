/**
 * 환경별 로깅 유틸리티 (Backend)
 * 프로덕션 환경에서는 로그를 출력하지 않습니다.
 */

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

const createLogger = (context) => ({
  log: (...args) => {
    if (isDevelopment) {
      console.log(`[${context}]`, ...args);
    }
  },

  info: (...args) => {
    if (isDevelopment) {
      console.info(`[${context}]`, ...args);
    }
  },

  warn: (...args) => {
    if (isDevelopment) {
      console.warn(`[${context}]`, ...args);
    }
  },

  error: (...args) => {
    // 에러는 항상 출력
    console.error(`[${context}]`, ...args);
  },

  debug: (...args) => {
    if (isDevelopment) {
      console.debug(`[${context}]`, ...args);
    }
  }
});

module.exports = { createLogger };
