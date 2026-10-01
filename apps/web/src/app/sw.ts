import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

/**
 * Service worker de coquille applicative (FR-23, AD-5).
 *
 * Il ne met en cache que des ressources statiques. Aucune réponse de /api n'y
 * entre : le stockage local d'une PWA iOS est purgé après sept jours sans
 * ouverture, ce qui interdit d'y traiter une donnée métier comme fiable.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * Rappels de repas (voir `src/server/services/reminders.ts`).
 *
 * Le contenu arrive du serveur en JSON ; un message illisible donne quand même
 * une notification générique plutôt que rien, puisqu'iOS retire la permission
 * à un site qui reçoit une notification sans en afficher.
 */
interface ReminderPayload {
  title?: unknown;
  body?: unknown;
  url?: unknown;
}

self.addEventListener('push', (event) => {
  let payload: ReminderPayload = {};
  try {
    payload = (event.data?.json() ?? {}) as ReminderPayload;
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' ? payload.title : 'NutriPerso';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'meal-reminder',
      data: { url },
    }),
  );
});

/** Le toucher ramène dans l'application, sur l'onglet déjà ouvert s'il y en a un. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: unknown } | null;
  const url = typeof data?.url === 'string' ? data.url : '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.navigate(url);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
