// public/sw.js
// Service Worker pour la PWA /admin — exclusivement dédié à Web Push.
//
// Pas de cache offline en v1 (out of scope). Le SW est servi avec
// `Service-Worker-Allowed: /` (cf. netlify.toml) pour pouvoir recevoir les
// notifications même si l'utilisateur n'est pas physiquement sur /admin au
// moment du push.
//
// Le `register()` côté client (cf. pages/_app.tsx) est gated derrière la
// variable d'env `NEXT_PUBLIC_ENABLE_PWA === '1'` — uniquement positionnée
// en production sur le dashboard Netlify (master).

self.addEventListener('install', () => {
  // Active immédiatement le nouveau SW sans attendre que tous les tabs soient
  // fermés. Combine avec clients.claim() dans `activate` pour rollouts rapides.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (_err) {
    data = { title: 'Notification', body: event.data.text() };
  }

  const title = data.title || "OW Women's Cup Admin";
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: data.data || { url: '/admin' },
    tag: data.tag, // dedupe : un push avec le même tag remplace le précédent
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        // Cherche un onglet admin déjà ouvert → focus + navigate. Évite
        // d'empiler les tabs si le staff clique plusieurs notifs.
        for (const client of clientsList) {
          if (client.url.includes('/admin') && 'focus' in client) {
            if ('navigate' in client) {
              client.navigate(targetUrl).catch(() => {
                // Si la navigation échoue (cross-origin, etc.), focus only.
              });
            }
            return client.focus();
          }
        }
        // Sinon ouvre un nouveau tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
