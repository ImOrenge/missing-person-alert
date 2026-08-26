/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { clientsClaim, type RouteHandlerCallbackOptions } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { firebaseConfig } from './services/firebaseConfig';

declare const self: (ServiceWorkerGlobalScope & typeof globalThis) & { __WB_MANIFEST: any };

const OFFLINE_HTML_URL = 'offline.html';
const PRECACHE_ASSETS = [
  ...(self.__WB_MANIFEST || []),
  { url: OFFLINE_HTML_URL, revision: '1.0.0' }
];

clientsClaim();

precacheAndRoute(PRECACHE_ASSETS);
cleanupOutdatedCaches();

try {
  const messagingApp = initializeApp(firebaseConfig);
  getMessaging(messagingApp);
} catch (error) {
  console.warn('Firebase Messaging 초기화 실패:', error);
}

registerRoute(
  ({ request }) => request.mode === 'navigate',
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

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

self.addEventListener('notificationclick', (event) => {
  const notificationEvent = event as NotificationEvent;
  notificationEvent.notification.close();
  const data = (notificationEvent.notification.data || {}) as Record<string, any>;
  const candidateUrl = typeof data.url === 'string' && data.url.trim().length > 0 ? data.url : '/';
  const absoluteUrl = new URL(candidateUrl, self.location.origin);

  notificationEvent.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const messagePayload = {
      type: 'OPEN_MISSING_PERSON',
      payload: {
        ...data,
        url: absoluteUrl.pathname + absoluteUrl.search
      }
    };

    for (const client of clientList) {
      const windowClient = client as WindowClient;
      try {
        await windowClient.focus();
      } catch {
        // focus 실패 시에도 메시지를 전달하기 위해 계속 진행
      }
      windowClient.postMessage(messagePayload);
      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(absoluteUrl.href);
    }
  })());
});

setCatchHandler(async (options: RouteHandlerCallbackOptions) => {
  const { request } = options;
  if (request?.destination === 'document') {
    const matchingResponse = await self.caches.match(OFFLINE_HTML_URL, { ignoreSearch: true });
    if (matchingResponse) {
      return matchingResponse;
    }
  }
  return Response.error();
});

self.addEventListener('message', (event: MessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    const globalScope = self as ServiceWorkerGlobalScope & { skipWaiting: () => void };
    if (typeof globalScope.skipWaiting === 'function') {
      globalScope.skipWaiting();
    }
  }
});
