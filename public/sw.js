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

// Tente de poser un badge sur l'icône installée (Windows taskbar / macOS
// dock / Android launcher). Best-effort : si `setAppBadge` n'est pas dispo
// (Safari, browser non-installé, OS sans support), on no-op silencieusement.
function trySetAppBadge() {
  if ('setAppBadge' in self.navigator) {
    self.navigator.setAppBadge().catch(() => {});
  }
}

function tryClearAppBadge() {
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }
}

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
    // renotify : re-pinger l'utilisateur même si un push avec le même tag
    // existe déjà (sans ça, le remplacement est silencieux). Sans tag, ce
    // flag est ignoré — pas de bruit additionnel sur les notifs uniques.
    renotify: data.renotify === true,
    // Boutons d'action (Chrome/Edge sur desktop + Android). Browsers non
    // supportés (Safari) ignorent silencieusement le champ.
    actions: Array.isArray(data.actions) ? data.actions : undefined,
    requireInteraction: false,
  };

  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), trySetAppBadge()])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Clic = le staff a vu la notif. Clear le badge (best-effort).
  tryClearAppBadge();
  const notifData = event.notification.data || {};
  // Si l'utilisateur a cliqué sur une action button précise et que le
  // dispatcher a fourni une URL pour cette action, on la prend. Sinon
  // (clic sur le corps de la notif, ou action sans URL custom), on
  // tombe sur l'URL par défaut.
  const actionUrls =
    notifData.action_urls && typeof notifData.action_urls === 'object'
      ? notifData.action_urls
      : null;
  const actionUrl =
    event.action && actionUrls ? actionUrls[event.action] : null;
  const targetUrl = actionUrl || notifData.url || '/admin';

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

// Permet au client de demander un clear (ex: page /admin/notifications montée).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-app-badge') {
    tryClearAppBadge();
  }
});

// ─────────────────────────────────────────────────────────
// Background Sync — replay des mutations queue'd offline.
// Schéma IDB partagé avec utils/bgSyncQueue.ts :
//   DB : 'wmc-bg-sync' v1
//   Store : 'mutations' (keyPath 'id', autoIncrement)
//   Row : { id, url, method, headers, body, createdAt }
// Tag attendu : 'wmc-mutations' (cf. SYNC_TAG côté client).
// ─────────────────────────────────────────────────────────

const BG_SYNC_DB = 'wmc-bg-sync';
const BG_SYNC_STORE = 'mutations';
const BG_SYNC_TAG = 'wmc-mutations';

function openBgSyncDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BG_SYNC_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BG_SYNC_STORE)) {
        db.createObjectStore(BG_SYNC_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function listQueuedMutations(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_SYNC_STORE, 'readonly');
    const req = tx.objectStore(BG_SYNC_STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

function deleteQueuedMutation(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_SYNC_STORE, 'readwrite');
    const req = tx.objectStore(BG_SYNC_STORE).delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

async function replayQueuedMutations() {
  const db = await openBgSyncDb();
  try {
    const rows = await listQueuedMutations(db);
    for (const row of rows) {
      try {
        const res = await fetch(row.url, {
          method: row.method,
          headers: row.headers,
          body: row.body,
          // credentials:'include' pour que les cookies de session admin
          // soient envoyés (le SW n'a pas accès à la session, le browser
          // attache les cookies du domaine).
          credentials: 'include',
        });
        if (res.ok) {
          await deleteQueuedMutation(db, row.id);
        } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          // 4xx non-retryable (sauf 408/429) = la requête ne réussira pas
          // au prochain replay. On retire pour ne pas spam-retry.
          await deleteQueuedMutation(db, row.id);
        }
        // 5xx / 408 / 429 / network error → on laisse en file, sync
        // rejouera au prochain tick.
      } catch (_err) {
        // Network toujours down — sync rejouera. Bénin.
      }
    }
  } finally {
    db.close();
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === BG_SYNC_TAG) {
    event.waitUntil(replayQueuedMutations());
  }
});
