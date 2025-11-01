import { useEffect, useMemo } from 'react';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { firebaseApp } from '../services/firebase';
import { logger } from '../utils/logger';

const firestore = getFirestore(firebaseApp);

const SESSION_STORAGE_KEY = 'missing_person_session_id';
const SESSION_CREATED_AT_KEY = 'missing_person_session_created_at';
const HEARTBEAT_INTERVAL_MS = 60_000;
const VISIBILITY_PING_COOLDOWN_MS = 10_000;
const MAX_USER_AGENT_LENGTH = 500;
const MAX_PLATFORM_LENGTH = 100;

const getSanitizedString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
};

const ensureSessionId = (): { sessionId: string; createdAt: number } | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    let sessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    let createdAt = window.sessionStorage.getItem(SESSION_CREATED_AT_KEY);

    if (!sessionId) {
      sessionId = typeof window.crypto?.randomUUID === 'function'
        ? `sess_${window.crypto.randomUUID()}`
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }

    if (!createdAt) {
      createdAt = Date.now().toString();
      window.sessionStorage.setItem(SESSION_CREATED_AT_KEY, createdAt);
    }

    return {
      sessionId,
      createdAt: Number(createdAt) || Date.now()
    };
  } catch (error) {
    logger.warn('세션 ID 확보 실패 (세션 추적 비활성화 가능):', error);
    return null;
  }
};

interface SessionUserInfo {
  uid: string | null;
  email: string | null;
  displayName: string | null;
}

const buildSessionPayload = (options: {
  sessionId: string;
  createdAt: number;
  user: SessionUserInfo;
  isActive?: boolean;
}): Record<string, unknown> => {
  const { sessionId, createdAt, user } = options;
  const now = Date.now();
  const userAgent = typeof window !== 'undefined' ? getSanitizedString(window.navigator.userAgent || '', MAX_USER_AGENT_LENGTH) : null;

  let platform: string | null = null;
  if (typeof window !== 'undefined') {
    const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
    platform = getSanitizedString(nav.userAgentData?.platform ?? nav.platform ?? '', MAX_PLATFORM_LENGTH);
  }

  return {
    sessionId,
    createdAt,
    updatedAt: now,
    lastActive: now,
    isActive: options.isActive ?? true,
    userId: user.uid,
    userEmail: user.email,
    displayName: user.displayName,
    userAgent,
    platform
  };
};

export function useActiveSessionTracker(user: User | null): void {
  const sessionUser = useMemo<SessionUserInfo>(() => ({
    uid: user?.uid ?? null,
    email: user?.email ?? null,
    displayName: user?.displayName ?? null
  }), [user?.uid, user?.email, user?.displayName]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const sessionInfo = ensureSessionId();
    if (!sessionInfo) {
      return undefined;
    }

    const { sessionId, createdAt } = sessionInfo;
    const recordRef = doc(firestore, 'activeSessions', sessionId);
    let lastVisibilityPing = 0;
    let cancelled = false;

    const writeSession = async (isActive = true) => {
      try {
        const payload = buildSessionPayload({
          sessionId,
          createdAt,
          user: sessionUser,
          isActive
        });

        await setDoc(recordRef, payload, { merge: true });
        logger.debug('[activeSession] 세션 업데이트 완료', payload);
      } catch (error) {
        if (!cancelled) {
          logger.warn('[activeSession] 세션 정보 업데이트 실패:', error);
        }
      }
    };

    void writeSession(true);

    const intervalId = window.setInterval(() => {
      void writeSession(true);
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilityPing >= VISIBILITY_PING_COOLDOWN_MS) {
          lastVisibilityPing = now;
          void writeSession(true);
        }
      }
    };

    const handleFocus = () => {
      void writeSession(true);
    };

    const handleOnline = () => {
      void writeSession(true);
    };

    const handleBeforeUnload = () => {
      void writeSession(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      void writeSession(false);
    };
  }, [sessionUser]);
}
