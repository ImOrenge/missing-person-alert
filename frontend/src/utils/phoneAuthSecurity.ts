/**
 * 전화번호 인증 보안 유틸리티
 * - Rate Limiting (비율 제한)
 * - 시도 횟수 제한
 * - 전화번호 형식 검증
 */

interface AuthAttempt {
  phoneNumber: string;
  timestamp: number;
  attempts: number;
}

const AUTH_STORAGE_KEY = 'phone_auth_attempts';
const MAX_ATTEMPTS_PER_PHONE = 5; // 전화번호당 최대 시도 횟수
const MAX_ATTEMPTS_PER_HOUR = 10; // 1시간당 최대 시도 횟수
const BLOCK_DURATION = 60 * 60 * 1000; // 1시간 차단
const ATTEMPT_RESET_TIME = 24 * 60 * 60 * 1000; // 24시간 후 리셋

/**
 * 로컬 스토리지에서 인증 시도 기록 가져오기
 */
const getAuthAttempts = (): AuthAttempt[] => {
  try {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!data) return [];

    const attempts: AuthAttempt[] = JSON.parse(data);
    const now = Date.now();

    // 24시간 이상 된 기록 삭제
    return attempts.filter(attempt => now - attempt.timestamp < ATTEMPT_RESET_TIME);
  } catch (error) {
    console.error('인증 시도 기록 로드 실패:', error);
    return [];
  }
};

/**
 * 인증 시도 기록 저장
 */
const saveAuthAttempts = (attempts: AuthAttempt[]) => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(attempts));
  } catch (error) {
    console.error('인증 시도 기록 저장 실패:', error);
  }
};

/**
 * 전화번호 형식 검증 (한국 전화번호)
 */
export const validatePhoneNumber = (phoneNumber: string): { valid: boolean; message?: string } => {
  // 공백 제거
  const cleaned = phoneNumber.replace(/\s/g, '');

  // 한국 휴대전화 형식 검증
  const mobileRegex = /^(01[0-9])-?([0-9]{3,4})-?([0-9]{4})$/;

  if (!cleaned) {
    return { valid: false, message: '전화번호를 입력해주세요' };
  }

  if (!mobileRegex.test(cleaned)) {
    return { valid: false, message: '올바른 전화번호 형식이 아닙니다\n예: 010-1234-5678' };
  }

  // 유효하지 않은 패턴 체크
  const invalidPatterns = [
    /^010-?0000-?0000$/, // 0000-0000
    /^010-?1111-?1111$/, // 반복 숫자
    /^010-?1234-?5678$/, // 순차 숫자 (예시용)
  ];

  if (invalidPatterns.some(pattern => pattern.test(cleaned))) {
    return { valid: false, message: '유효하지 않은 전화번호입니다' };
  }

  return { valid: true };
};

/**
 * 전화번호 정규화 (국제 형식으로 변환)
 */
export const normalizePhoneNumber = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\s/g, '').replace(/-/g, '');

  // 010으로 시작하면 +82로 변환
  if (cleaned.startsWith('010')) {
    return `+82${cleaned.substring(1)}`;
  }

  // 이미 +82로 시작하면 그대로 반환
  if (cleaned.startsWith('+82')) {
    return cleaned;
  }

  // 0으로 시작하면 +82로 변환
  if (cleaned.startsWith('0')) {
    return `+82${cleaned.substring(1)}`;
  }

  return `+82${cleaned}`;
};

/**
 * 인증 시도 가능 여부 확인
 */
export const canAttemptAuth = (phoneNumber: string): {
  allowed: boolean;
  message?: string;
  remainingTime?: number;
} => {
  const attempts = getAuthAttempts();
  const now = Date.now();
  const normalized = normalizePhoneNumber(phoneNumber);

  // 해당 전화번호의 시도 기록 확인
  const phoneAttempts = attempts.filter(a => a.phoneNumber === normalized);

  if (phoneAttempts.length > 0) {
    const lastAttempt = phoneAttempts[phoneAttempts.length - 1];
    const timeSinceLastAttempt = now - lastAttempt.timestamp;

    // 차단 상태 확인
    if (lastAttempt.attempts >= MAX_ATTEMPTS_PER_PHONE && timeSinceLastAttempt < BLOCK_DURATION) {
      const remainingTime = Math.ceil((BLOCK_DURATION - timeSinceLastAttempt) / 1000 / 60);
      return {
        allowed: false,
        message: `너무 많은 시도로 인해 일시적으로 차단되었습니다\n${remainingTime}분 후에 다시 시도해주세요`,
        remainingTime
      };
    }
  }

  // 1시간 내 총 시도 횟수 확인
  const recentAttempts = attempts.filter(a => now - a.timestamp < 60 * 60 * 1000);

  if (recentAttempts.length >= MAX_ATTEMPTS_PER_HOUR) {
    return {
      allowed: false,
      message: '1시간 내 최대 시도 횟수를 초과했습니다\n잠시 후 다시 시도해주세요'
    };
  }

  return { allowed: true };
};

/**
 * 인증 시도 기록
 */
export const recordAuthAttempt = (phoneNumber: string) => {
  const attempts = getAuthAttempts();
  const normalized = normalizePhoneNumber(phoneNumber);
  const now = Date.now();

  // 기존 기록 확인
  const existingIndex = attempts.findIndex(a => a.phoneNumber === normalized);

  if (existingIndex !== -1) {
    const existing = attempts[existingIndex];
    const timeSinceLastAttempt = now - existing.timestamp;

    // 차단 기간이 지났으면 리셋
    if (timeSinceLastAttempt >= BLOCK_DURATION) {
      attempts[existingIndex] = {
        phoneNumber: normalized,
        timestamp: now,
        attempts: 1
      };
    } else {
      // 시도 횟수 증가
      attempts[existingIndex] = {
        ...existing,
        timestamp: now,
        attempts: existing.attempts + 1
      };
    }
  } else {
    // 새 기록 추가
    attempts.push({
      phoneNumber: normalized,
      timestamp: now,
      attempts: 1
    });
  }

  saveAuthAttempts(attempts);
};

/**
 * 인증 성공 시 기록 초기화
 */
export const clearAuthAttempts = (phoneNumber: string) => {
  const attempts = getAuthAttempts();
  const normalized = normalizePhoneNumber(phoneNumber);

  const filtered = attempts.filter(a => a.phoneNumber !== normalized);
  saveAuthAttempts(filtered);
};

/**
 * 모든 인증 시도 기록 초기화 (관리자용)
 */
export const clearAllAuthAttempts = () => {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error('인증 시도 기록 초기화 실패:', error);
  }
};

/**
 * 인증 시도 통계 조회
 */
export const getAuthStats = (phoneNumber?: string) => {
  const attempts = getAuthAttempts();

  if (phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    const phoneAttempts = attempts.filter(a => a.phoneNumber === normalized);

    return {
      totalAttempts: phoneAttempts.reduce((sum, a) => sum + a.attempts, 0),
      lastAttempt: phoneAttempts.length > 0 ? phoneAttempts[phoneAttempts.length - 1].timestamp : null,
      isBlocked: phoneAttempts.some(a => {
        const timeSince = Date.now() - a.timestamp;
        return a.attempts >= MAX_ATTEMPTS_PER_PHONE && timeSince < BLOCK_DURATION;
      })
    };
  }

  return {
    totalPhones: new Set(attempts.map(a => a.phoneNumber)).size,
    totalAttempts: attempts.reduce((sum, a) => sum + a.attempts, 0),
    recentAttempts: attempts.filter(a => Date.now() - a.timestamp < 60 * 60 * 1000).length
  };
};

/**
 * 보안 경고 메시지 생성
 */
export const getSecurityWarning = (phoneNumber: string): string | null => {
  const attempts = getAuthAttempts();
  const normalized = normalizePhoneNumber(phoneNumber);
  const phoneAttempts = attempts.filter(a => a.phoneNumber === normalized);

  if (phoneAttempts.length === 0) return null;

  const lastAttempt = phoneAttempts[phoneAttempts.length - 1];
  const remainingAttempts = MAX_ATTEMPTS_PER_PHONE - lastAttempt.attempts;

  if (remainingAttempts <= 2 && remainingAttempts > 0) {
    return `주의: ${remainingAttempts}번의 시도가 남았습니다. 초과 시 1시간 동안 차단됩니다.`;
  }

  return null;
};
