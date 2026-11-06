/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

// ============================================================
// Precaching - injected by vite-plugin-pwa at build time.
// The __WB_MANIFEST placeholder is replaced with the actual asset list.
// ============================================================
precacheAndRoute(self.__WB_MANIFEST);

// ============================================================
// Web Push handlers.
// ============================================================

interface PushPayload {
  type: 'daily_assigned' | 'bilan_ready';
  title: string;
  body: string;
  url: string;
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    console.warn('[sw] push event with no data');
    return;
  }

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch (err) {
    console.error('[sw] failed to parse push payload as JSON:', err);
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapse multiple notifs of the same type (don't stack daily reminders).
      tag: payload.type,
      data: { url: payload.url },
      // Per spec, no requireInteraction: notification auto-dismisses on user-agent default timeout.
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      // Focus an existing tab if one is open within scope; else open new.
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = allClients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        // Navigate the focused tab to the target URL.
        if (
          'navigate' in existing &&
          typeof (existing as { navigate?: (u: string) => Promise<unknown> }).navigate ===
            'function'
        ) {
          await (existing as { navigate: (u: string) => Promise<unknown> }).navigate(url);
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// ============================================================
// Skip waiting hook - works with vite-plugin-pwa's prompt mode.
// The frontend's <PWAUpdatePrompt> calls updateServiceWorker(true) which
// triggers this; SW then activates immediately.
// ============================================================
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && (event.data as { type?: string }).type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
