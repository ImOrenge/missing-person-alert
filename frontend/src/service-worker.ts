/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, CacheFirst } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig } from './services/firebaseConfig';

declare const self: (ServiceWorkerGlobalScope & typeof globalThis) & { __WB_MANIFEST: any };

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

try {
  const messagingApp = initializeApp(firebaseConfig);
  const messaging = getMessaging(messagingApp);

  onBackgroundMessage(messaging, (payload) => {
    const notificationTitle = payload.notification?.title ?? '실시간 실종자 알림';
    const notificationOptions: NotificationOptions = {
      body: payload.notification?.body ?? '새로운 실종자 소식이 도착했습니다.',
      icon: payload.notification?.icon ?? '/icons/pwa-icon-192.png',
      data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions).catch((error) => {
      console.error('백그라운드 알림 표시 실패:', error);
    });
  });
} catch (error) {
  console.warn('Firebase Messaging 초기화 실패:', error);
}

registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: 'pages-cache',
    networkTimeoutSeconds: 10
  })
);

registerRoute(
  ({ request }) => request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({
    cacheName: 'static-resources'
  })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 7 * 24 * 60 * 60
      })
    ]
  })
);

addEventListener('message', (event: MessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    const globalScope = self as ServiceWorkerGlobalScope & { skipWaiting: () => void };
    if (typeof globalScope.skipWaiting === 'function') {
      globalScope.skipWaiting();
    }
  }
});
