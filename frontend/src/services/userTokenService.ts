import { getAuth } from 'firebase/auth';
import apiClient from './apiClient';

const LOCAL_STORAGE_KEY = 'mp_push_token_state';

type LocalTokenState = {
  token: string;
  uid: string | null;
  updatedAt: number;
};

const readLocalTokenState = (): LocalTokenState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LocalTokenState : null;
  } catch (error) {
    console.warn('[PushToken] 로컬 토큰 상태를 읽는 중 오류:', error);
    return null;
  }
};

const writeLocalTokenState = (state: LocalTokenState | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (state) {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[PushToken] 로컬 토큰 상태를 저장하는 중 오류:', error);
  }
};

const detectPlatform = (): string => {
  if (typeof navigator === 'undefined') return 'web';
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  if (/windows/.test(userAgent)) return 'windows';
  if (/mac/.test(userAgent)) return 'mac';
  if (/linux/.test(userAgent)) return 'linux';
  return 'web';
};

const authenticatedHeaders = async (expectedUid: string) => {
  const user = getAuth().currentUser;
  if (!user || user.uid !== expectedUid) {
    throw new Error('로그인 계정과 알림 기기 소유자가 일치하지 않습니다.');
  }
  return { Authorization: `Bearer ${await user.getIdToken()}` };
};

export const syncUserFcmToken = async (uid: string, token: string) => {
  if (!uid || !token) return;
  await apiClient.put('/api/v2/alerts/device-token', {
    token,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 500),
    platform: detectPlatform(),
  }, { headers: await authenticatedHeaders(uid) });

  writeLocalTokenState({ token, uid, updatedAt: Date.now() });
};

type DetachOptions = {
  skipLocalUpdate?: boolean;
};

export const detachFcmToken = async (uid: string, token: string, options?: DetachOptions) => {
  if (!uid || !token) return;
  const user = getAuth().currentUser;
  if (user?.uid === uid) {
    await apiClient.delete('/api/v2/alerts/device-token', {
      headers: await authenticatedHeaders(uid),
      data: { token },
    });
  }

  if (!options?.skipLocalUpdate) {
    const state = readLocalTokenState();
    if (state?.token === token && state.uid === uid) {
      writeLocalTokenState(null);
    }
  }
};

export const clearLocalTokenState = () => {
  writeLocalTokenState(null);
};

export const getLocalTokenState = () => readLocalTokenState();
