import { useCallback, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { requestNotificationPermission, retrieveFcmToken } from '../services/firebaseMessaging';
import { syncUserFcmToken, detachFcmToken, getLocalTokenState, clearLocalTokenState } from '../services/userTokenService';

export type PushPermissionStatus = 'unsupported' | 'blocked' | 'prompt' | 'enabled' | 'off';

export const PUSH_PROMPT_STORAGE_KEY = 'mp_push_prompt_shown';
export const PUSH_OPT_OUT_STORAGE_KEY = 'mp_push_opt_out';

let inMemoryOptOut = false;

const readOptOut = () => {
  if (typeof window === 'undefined') return inMemoryOptOut;
  try {
    const raw = window.localStorage.getItem(PUSH_OPT_OUT_STORAGE_KEY);
    inMemoryOptOut = raw === 'true';
    return inMemoryOptOut;
  } catch (error) {
    console.warn('[Push] 로컬 저장소 접근 실패:', error);
    return inMemoryOptOut;
  }
};

const writeOptOut = (value: boolean) => {
  inMemoryOptOut = value;
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(PUSH_OPT_OUT_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(PUSH_OPT_OUT_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[Push] 옵트아웃 상태 저장 실패:', error);
  }
};

const markPromptShown = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
  } catch (error) {
    console.warn('[Push] 권한 프롬프트 상태 저장 실패:', error);
  }
};

const computeStatus = (): { status: PushPermissionStatus; permission: NotificationPermission | 'default'; optedOut: boolean } => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { status: 'unsupported', permission: 'default', optedOut: false };
  }

  const permission = Notification.permission;
  const optedOut = readOptOut();

  if (permission === 'denied') {
    return { status: 'blocked', permission, optedOut };
  }

  if (permission === 'granted') {
    return { status: optedOut ? 'off' : 'enabled', permission, optedOut };
  }

  return { status: optedOut ? 'off' : 'prompt', permission, optedOut };
};

export const usePushNotifications = (currentUser: User | null) => {
  const [{ status, permission, optedOut }, setSnapshot] = useState(computeStatus);
  const [isProcessing, setIsProcessing] = useState(false);

  const refreshStatus = useCallback(() => {
    setSnapshot(computeStatus());
  }, []);

  const enablePush = useCallback(async () => {
    if (!currentUser) {
      throw new Error('로그인이 필요합니다');
    }
    setIsProcessing(true);

    try {
      const permissionResult = await requestNotificationPermission();
      if (permissionResult !== 'granted') {
        markPromptShown();
        writeOptOut(false);
        setSnapshot(prev => ({
          ...prev,
          status: 'blocked',
          permission: permissionResult,
          optedOut: false
        }));
        return { status: 'blocked' as PushPermissionStatus };
      }

      const token = await retrieveFcmToken();
      if (!token) {
        throw new Error('푸시 토큰을 가져오지 못했습니다');
      }

      await syncUserFcmToken(currentUser.uid, token);
      markPromptShown();
      writeOptOut(false);
      setSnapshot(prev => ({
        ...prev,
        status: 'enabled',
        permission: 'granted',
        optedOut: false
      }));
      return { status: 'enabled' as PushPermissionStatus, token };
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser]);

  const disablePush = useCallback(async () => {
    setIsProcessing(true);
    try {
      const tokenState = getLocalTokenState();
      const token = tokenState?.token;
      const uid = tokenState?.uid || currentUser?.uid;

      if (uid && token) {
        try {
          await detachFcmToken(uid, token);
        } catch (error) {
          console.warn('[Push] 토큰 해제 실패:', error);
        }
      }

      clearLocalTokenState();
      markPromptShown();
      writeOptOut(true);
      setSnapshot(prev => ({
        ...prev,
        status: 'off',
        optedOut: true
      }));
      return { status: 'off' as PushPermissionStatus };
    } finally {
      setIsProcessing(false);
    }
  }, [currentUser]);

  const syncExistingToken = useCallback(async () => {
    if (!currentUser) {
      return { synced: false };
    }

    const token = await retrieveFcmToken();
    if (!token) {
      return { synced: false };
    }

    await syncUserFcmToken(currentUser.uid, token);
    writeOptOut(false);
    setSnapshot(prev => ({
      ...prev,
      status: 'enabled',
      permission: 'granted',
      optedOut: false
    }));
    return { synced: true, token };
  }, [currentUser]);

  return useMemo(
    () => ({
      status,
      permission,
      optedOut,
      isProcessing,
      enablePush,
      disablePush,
      syncExistingToken,
      refreshStatus
    }),
    [status, permission, optedOut, isProcessing, enablePush, disablePush, syncExistingToken, refreshStatus]
  );
};
