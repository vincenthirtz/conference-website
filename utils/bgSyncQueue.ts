// utils/bgSyncQueue.ts
//
// Background Sync queue (IndexedDB) côté client. Permet d'enregistrer une
// mutation HTTP critique quand la requête échoue (network down, captive
// portal, OS sleeping). Le Service Worker (public/sw.js) la rejouera
// automatiquement dès que le browser détecte la reconnexion, via la
// Background Sync API (`sync` event).
//
// Cycle de vie typique :
//
//   1. Caller try { await fetch(url, init) } catch (err)
//   2. Si `isNetworkError(err)` → `await enqueueMutation(url, init)`
//   3. enqueueMutation() ouvre la DB, INSERT la row, registre le sync tag.
//   4. Plus tard, network revient → SW reçoit `sync` event → replaye chaque
//      row via fetch, supprime sur 2xx, garde sur 4xx/5xx pour next tick.
//
// Pourquoi c'est safe :
//   - Toutes les mutations admin passent par `useIdempotentMutation` qui
//     injecte `Idempotency-Key`. Replay du même body avec la même clé est
//     dédupliqué côté serveur (cf. utils/adminIdempotency.ts).
//   - On capture les headers du request original (y compris la clé), donc
//     le replay est byte-identical.
//
// Browser support :
//   - Background Sync API : Chrome / Edge / Opera (les browsers Chromium).
//   - Firefox / Safari : pas de Background Sync. Fallback gracieux :
//     `isBackgroundSyncSupported()` renvoie false, le caller peut alors
//     soit montrer un toast "réessaie quand tu as du réseau" soit retry
//     manuellement.

const DB_NAME = 'wmc-bg-sync';
const DB_VERSION = 1;
const STORE = 'mutations';
export const SYNC_TAG = 'wmc-mutations';

export type QueuedMutation = {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
};

export function isBackgroundSyncSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  // SyncManager n'est pas typé par défaut dans lib.dom.d.ts strict — on test
  // par feature detection sur le prototype.
  if (
    !('ServiceWorkerRegistration' in window) ||
    !('sync' in ServiceWorkerRegistration.prototype)
  ) {
    return false;
  }
  return true;
}

/**
 * Heuristique pour détecter une erreur réseau (vs erreur applicative).
 * fetch() throw un TypeError quand la requête n'atteint jamais le serveur
 * (DNS, offline, CORS preflight failed, etc.). Sur Chrome on a aussi le
 * navigator.onLine flag, mais il est notoirement peu fiable — on le combine
 * comme signal, pas comme vérité.
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'TypeError') return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

/**
 * Sérialise le RequestInit pour persistence. body peut être string, FormData
 * ou Blob ; on accepte uniquement string ici (les autres formes sont rares
 * sur nos endpoints admin et compliqueraient la rehydratation côté SW).
 */
export async function enqueueMutation(
  url: string,
  init: RequestInit = {}
): Promise<number> {
  const headers: Record<string, string> = {};
  const initHeaders = new Headers(init.headers);
  initHeaders.forEach((value, key) => {
    headers[key] = value;
  });

  const body = typeof init.body === 'string' ? init.body : null;

  const db = await openDb();
  try {
    const id = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const row: QueuedMutation = {
        url,
        method: (init.method || 'GET').toUpperCase(),
        headers,
        body,
        createdAt: Date.now(),
      };
      const req = store.add(row);
      req.onerror = () => reject(req.error ?? new Error('idb add failed'));
      req.onsuccess = () => resolve(req.result as number);
    });

    // Register sync tag — le SW recevra `sync` event quand network sera up.
    // Si pas supporté, on a quand même la row en file ; un client futur
    // pourra la rejouer manuellement (ex: bouton "Réessayer toutes les
    // actions en attente").
    if (isBackgroundSyncSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // `sync` est typé sur ServiceWorkerRegistration via lib.dom étendu ;
        // certaines versions de TS ne l'exposent pas. Cast restreint.
        await (
          reg as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }
        ).sync.register(SYNC_TAG);
      } catch {
        // SW pas prêt ou sync refusé (mode privé) → la row reste en file,
        // bénin.
      }
    }

    return id;
  } finally {
    db.close();
  }
}

/**
 * Compte les mutations actuellement en attente. Utile pour afficher un
 * badge "N actions en file" dans l'UI.
 */
export async function countQueuedMutations(): Promise<number> {
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.count();
      req.onerror = () => reject(req.error ?? new Error('idb count failed'));
      req.onsuccess = () => resolve(req.result);
    });
  } finally {
    db.close();
  }
}
