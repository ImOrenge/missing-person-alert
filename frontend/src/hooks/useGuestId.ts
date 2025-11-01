import { useState, useEffect } from 'react';
import { getOrCreateGuestId, clearGuestId, getGuestIdInfo, type GuestIdInfo } from '../utils/guestId';
import type { User } from 'firebase/auth';

/**
 * Guest ID 관리 훅
 * - 비로그인 사용자에게 고유 ID 부여
 * - 로그인 시 Guest ID 삭제
 * - 현재 사용자 식별자 반환 (로그인: uid, 비로그인: guestId)
 */
export function useGuestId(currentUser: User | null) {
  const [guestIdInfo, setGuestIdInfo] = useState<GuestIdInfo | null>(null);

  useEffect(() => {
    if (currentUser) {
      // 로그인 상태: Guest ID 삭제
      clearGuestId();
      setGuestIdInfo(null);
    } else {
      // 비로그인 상태: Guest ID 생성/조회
      const info = getGuestIdInfo();
      setGuestIdInfo(info);
    }
  }, [currentUser]);

  // 현재 사용자 식별자 반환
  const getUserIdentifier = (): string => {
    if (currentUser) {
      return currentUser.uid;
    }
    return guestIdInfo?.guestId || getOrCreateGuestId();
  };

  // 사용자 타입 반환
  const getUserType = (): 'authenticated' | 'guest' => {
    return currentUser ? 'authenticated' : 'guest';
  };

  return {
    guestIdInfo,
    userId: getUserIdentifier(),
    userType: getUserType(),
    isGuest: !currentUser
  };
}
