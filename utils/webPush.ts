// utils/webPush.ts
//
// Helpers Web Push côté navigateur (PWA /admin).
// Toutes les fonctions ici doivent être appelées dans un contexte CLIENT
// uniquement (elles utilisent `window`, `navigator`, `Notification`).

/**
 * Convertit une clé publique VAPID encodée en base64-url (string) en un
 * ArrayBuffer consommable par `pushManager.subscribe({ applicationServerKey })`.
 *
 * On retourne l'ArrayBuffer (et pas le Uint8Array) parce que le type de
 * `applicationServerKey` est `BufferSource` : avec TS 5+ et lib.dom strict,
 * `Uint8Array<ArrayBufferLike>` ne satisfait plus `BufferSource` à cause du
 * SharedArrayBuffer possible. ArrayBuffer pur est toujours accepté.
 *
 * Source : pattern standard MDN / web-push docs.
 * https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
 */
export function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

/**
 * État du capability Web Push côté browser. Utilisé par les composants UI
 * pour décider quoi afficher (banner opt-in, état "déjà abonné", "device
 * incompatible", etc.).
 */
export type WebPushSupport =
  | { supported: true }
  | {
      supported: false;
      reason: 'no-window' | 'no-sw' | 'no-push' | 'no-notif';
    };

export function getWebPushSupport(): WebPushSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'no-window' };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'no-sw' };
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'no-push' };
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'no-notif' };
  }
  return { supported: true };
}

/**
 * Récupère la PushSubscription active (si existe) pour ce browser. Retourne
 * `null` si le SW n'est pas encore enregistré ou si le user n'est pas abonné.
 */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  const support = getWebPushSupport();
  if (!support.supported) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}
