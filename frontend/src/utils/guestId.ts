/**
 * Guest ID 관리 유틸리티
 * 비로그인 사용자를 식별하기 위한 고유 ID 생성 및 관리
 */

const GUEST_ID_KEY = 'missing_person_guest_id';
const GUEST_ID_CREATED_KEY = 'missing_person_guest_id_created';

/**
 * 고유한 Guest ID 생성
 * 형식: guest_[timestamp]_[random]
 */
export function generateGuestId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `guest_${timestamp}_${random}`;
}

/**
 * Guest ID 가져오기 (없으면 새로 생성)
 */
export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') {
    return 'guest_server';
  }

  try {
    // 기존 Guest ID 확인
    let guestId = window.localStorage.getItem(GUEST_ID_KEY);

    if (!guestId) {
      // 새 Guest ID 생성
      guestId = generateGuestId();
      window.localStorage.setItem(GUEST_ID_KEY, guestId);
      window.localStorage.setItem(GUEST_ID_CREATED_KEY, new Date().toISOString());

      console.log(`✅ 새 Guest ID 생성: ${guestId}`);
    }

    return guestId;
  } catch (error) {
    console.error('❌ Guest ID 생성/조회 실패:', error);
    // localStorage 접근 실패 시 세션용 임시 ID 반환
    return `guest_temp_${Date.now()}`;
  }
}

/**
 * 현재 Guest ID 가져오기 (없으면 null)
 */
export function getGuestId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(GUEST_ID_KEY);
  } catch (error) {
    console.error('❌ Guest ID 조회 실패:', error);
    return null;
  }
}

/**
 * Guest ID 삭제 (로그인 시 호출)
 */
export function clearGuestId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(GUEST_ID_KEY);
    window.localStorage.removeItem(GUEST_ID_CREATED_KEY);
    console.log('✅ Guest ID 삭제됨');
  } catch (error) {
    console.error('❌ Guest ID 삭제 실패:', error);
  }
}

/**
 * Guest ID 생성 시각 가져오기
 */
export function getGuestIdCreatedAt(): Date | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const createdAt = window.localStorage.getItem(GUEST_ID_CREATED_KEY);
    return createdAt ? new Date(createdAt) : null;
  } catch (error) {
    console.error('❌ Guest ID 생성 시각 조회 실패:', error);
    return null;
  }
}

/**
 * Guest ID 정보 객체 반환
 */
export interface GuestIdInfo {
  guestId: string;
  createdAt: Date | null;
  isTemporary: boolean;
}

export function getGuestIdInfo(): GuestIdInfo {
  const guestId = getOrCreateGuestId();
  const createdAt = getGuestIdCreatedAt();
  const isTemporary = guestId.startsWith('guest_temp_');

  return {
    guestId,
    createdAt,
    isTemporary
  };
}
