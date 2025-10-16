import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { firebaseApp } from './firebase';

let messagingPromise: Promise<import('firebase/messaging').Messaging> | null = null;

const getMessagingInstance = async () => {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const supported = await isSupported().catch(() => false);
      if (!supported) {
        throw new Error('이 브라우저는 Web Push를 지원하지 않습니다.');
      }
      return getMessaging(firebaseApp);
    })();
  }
  return messagingPromise;
};

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('이 환경에서는 알림을 지원하지 않습니다.');
  }

  if (Notification.permission === 'granted') {
    return 'granted' as NotificationPermission;
  }

  return Notification.requestPermission();
};

export const retrieveFcmToken = async (): Promise<string | null> => {
  try {
    if (typeof window === 'undefined' || !('navigator' in window) || !('serviceWorker' in navigator)) {
      console.warn('서비스워커를 사용할 수 없어 푸시 토큰을 발급받을 수 없습니다.');
      return null;
    }

    const messaging = await getMessagingInstance();

    const vapidKey = process.env.REACT_APP_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('VAPID 키가 설정되지 않았습니다.');
    }

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration
    });
    return token ?? null;
  } catch (error) {
    console.error('FCM 토큰 불러오기 실패:', error);
    return null;
  }
};

export const onForegroundMessage = async (callback: (payload: unknown) => void) => {
  try {
    const messaging = await getMessagingInstance();
    return onMessage(messaging, callback);
  } catch (error) {
    console.error('포그라운드 메시지 구독 실패:', error);
    return () => undefined;
  }
};
