// public/sw.js
// Service Worker pour la PWA staff. Trois rôles :
//   1. Web Push (notifications staff via bot_event_outbox, cf. dispatcher).
//   2. App shell caching — la PWA installée reste utilisable hors-ligne :
//      navigation network-first avec fallback /offline.html, assets statiques
//      stale-while-revalidate.
//   3. Background Sync — replay des mutations queue'd via IDB (cf.
//      utils/bgSyncQueue.ts).
//
// Le SW est servi avec `Service-Worker-Allowed: /` (cf. netlify.toml) pour
// recevoir les notifications même hors /admin.
//
// `register()` côté client (pages/_app.tsx) est gated par
// NEXT_PUBLIC_ENABLE_PWA === '1' (prod Netlify uniquement).
//
// Versioning du cache : bump SHELL_CACHE_VERSION quand le shell change.
// L'activation nettoie les vieux caches. `skipWaiting()` reste activé tant
// que l'update flow piloté côté client (Lot suivant) n'est pas en place ;
// un nouveau SW prend le contrôle immédiatement.

const SHELL_CACHE_VERSION = 'v1';
const SHELL_CACHE = `wmc-shell-${SHELL_CACHE_VERSION}`;
const RUNTIME_CACHE = `wmc-runtime-${SHELL_CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';
// Assets précachés à l'install. Tout doit être présent en build prod sinon
// l'install échoue silencieusement et le SW reste sur l'ancienne version.
const SHELL_PRECACHE = [OFFLINE_URL, '/favicon.ico', '/site.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll est atomique : si un seul fetch échoue, rien n'est mis en
      // cache et l'install fail. cache.add() en série tolère les misses
      // silencieusement, ce qu'on préfère ici (un asset manquant ne doit
      // pas casser le SW entier).
      await Promise.all(
        SHELL_PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            // Asset manquant — pas grave, on continue sans le précacher.
          })
        )
      );
      // Active immédiatement le nouveau SW. Le client peut détecter
      // l'arrivée d'une nouvelle version via `controllerchange` et
      // proposer un refresh (cf. Lot update flow).
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nettoyage des anciens caches versionnés.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('wmc-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ─────────────────────────────────────────────────────────
// Fetch handler — stratégies par type de requête.
//
//   - Cross-origin                : passthrough (pas de cache).
//   - /api/*, /sw.js              : passthrough (jamais cache).
//   - Navigation (request.mode)   : network-first → cache → /offline.html.
//   - Assets statiques same-origin : stale-while-revalidate.
//
// On ne touche pas aux POST/PUT/DELETE — seules les GET sont cacheables.
// ─────────────────────────────────────────────────────────

function isNavigation(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept')?.includes('text/html'))
  );
}

async function networkFirstNavigation(request) {
  try {
    const networkRes = await fetch(request);
    // Cache les navigations 2xx pour fallback offline. On évite les redirects
    // (3xx) et les erreurs (4xx/5xx) qui n'ont pas vocation à être servies
    // offline.
    if (networkRes.ok && networkRes.status >= 200 && networkRes.status < 300) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkRes.clone()).catch(() => {});
    }
    return networkRes;
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    // Dernier recours : réponse minimale, ne devrait jamais arriver vu que
    // /offline.html est précaché à l'install.
    return new Response('Hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      // On cache uniquement les 2xx — un 404 cacheé ferait persister le miss.
      if (res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Twitch, HelloAsso, push services) → passthrough.
  if (url.origin !== self.location.origin) return;

  // Jamais cacher : API, le SW lui-même, les manifests (qui peuvent changer
  // entre deploys), et /_next/data/ (props SSR/SSG utilisés par le
  // client-side router — les cacher en SWR sert des données stale et
  // casse le JSON parsing si le buildId change après un deploy).
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname === '/sw.js' ||
    url.pathname.endsWith('.webmanifest')
  ) {
    return;
  }

  if (isNavigation(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Assets statiques same-origin (JS chunks, CSS, images, fonts) :
  // stale-while-revalidate. Next.js inclut un hash dans le filename des
  // chunks (immutable), donc cache-busting par URL fonctionne nativement.
  event.respondWith(staleWhileRevalidate(request));
});

// Tente de poser un badge (avec compteur) sur l'icône installée
// (Windows taskbar / macOS dock / Android launcher). Best-effort :
// si `setAppBadge` n'est pas dispo (Safari, browser non-installé,
// OS sans support), on no-op silencieusement.
//
// `count` peut être omis pour afficher juste un "dot" sans nombre (fallback
// quand on n'a pas la valeur exacte). Avec un nombre, l'OS rend le badge
// avec ce nombre (Windows tronque à 99+).
function trySetAppBadge(count) {
  if ('setAppBadge' in self.navigator) {
    if (typeof count === 'number' && count > 0) {
      self.navigator.setAppBadge(count).catch(() => {});
    } else {
      self.navigator.setAppBadge().catch(() => {});
    }
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

  // Badge V2 : le dispatcher inclut `data.unread_count` = nombre d'events
  // non-ack'd AVANT celui-ci. On ajoute +1 pour le push qu'on est en train
  // de show. Fallback dot si la valeur n'est pas fournie (anciens payloads
  // ou push tiers).
  const unreadBefore =
    options.data && typeof options.data.unread_count === 'number'
      ? options.data.unread_count
      : null;
  const badgeCount =
    unreadBefore !== null && unreadBefore >= 0 ? unreadBefore + 1 : undefined;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      trySetAppBadge(badgeCount),
    ])
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
