// lib/analytics/consent.ts
//
// Lecture du consentement « analytics » depuis du code NON-React.
//
// Le bandeau cookies demandait déjà la permission pour la catégorie `analytics`
// (hooks/useCookieConsent.ts) sans que rien ne la consomme. C'est ici qu'elle
// devient effective : aucun script de mesure n'est chargé et aucun événement
// n'est envoyé tant que la joueuse n'a pas explicitement accepté.
//
// Le défaut est le refus : pas de consentement enregistré ⇒ pas de mesure.

import {
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_VERSION,
  COOKIE_CONSENT_CHANGE_EVENT,
} from '@/hooks/useCookieConsent';

/**
 * `true` uniquement si un consentement de la version courante est stocké ET
 * que la catégorie `analytics` y est cochée.
 *
 * Tolérant à tout : SSR (pas de `window`), navigation privée qui fait lever
 * l'accès à `localStorage`, JSON corrompu, version de consentement périmée
 * (le bandeau se réaffichera alors et la mesure reste coupée entre-temps).
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as {
      version?: string;
      preferences?: { analytics?: boolean };
    };
    if (parsed?.version !== COOKIE_CONSENT_VERSION) return false;
    return parsed?.preferences?.analytics === true;
  } catch {
    return false;
  }
}

/**
 * S'abonne aux changements de consentement. Retourne la fonction de
 * désabonnement.
 *
 * Deux sources : l'événement maison émis par `useCookieConsent` (même onglet)
 * et `storage` (autre onglet — refuser dans un onglet doit couper la mesure
 * partout).
 */
export function subscribeToAnalyticsConsent(
  onChange: (granted: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = () => onChange(hasAnalyticsConsent());
  const storageHandler = (e: StorageEvent) => {
    if (e.key === null || e.key === COOKIE_CONSENT_KEY) handler();
  };

  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, handler);
  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
