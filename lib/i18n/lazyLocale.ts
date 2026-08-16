// lib/i18n/lazyLocale.ts
//
// Chargement PARESSEUX du dictionnaire non-actif.
//
// Pourquoi : `useT` / `useAdminT` importaient statiquement LES DEUX locales.
// Résultat mesuré sur un build de prod (Next 16 / Turbopack) :
//
//   - chunk locales publiques  : 427 KB brut / 138 KB gzip — tiré par 177 pages
//   - chunk locales admin      : 627 KB brut / 178 KB gzip — tiré par 93 pages
//
// …soit ~34 % du First Load JS d'une page publique et ~55 % de celui d'une page
// admin, dont la MOITIÉ est une langue que le visiteur ne regarde pas.
//
// Or `LanguageProvider` rend TOUJOURS 'fr' au SSR et au premier rendu client
// (la préférence stockée n'est appliquée qu'en `useEffect`, pour éviter tout
// mismatch d'hydratation). L'anglais n'est donc jamais requis de façon
// synchrone : on peut le charger à la demande, en chunk séparé.
//
// Le français reste importé statiquement — c'est la langue par défaut, la
// source de vérité des types, et le fallback affiché tant que l'anglais n'est
// pas arrivé (le temps d'un `import()`, invisible en pratique).

import { useEffect, useSyncExternalStore } from 'react';
import { useLang } from './LanguageProvider';

/**
 * Fabrique un hook de dictionnaire à locale paresseuse.
 *
 * @param frDict dictionnaire français (importé statiquement — sert aussi de type)
 * @param loadEn loader dynamique de la locale anglaise (`() => import('./en.json')`)
 */
export function createLocaleHook<T>(
  frDict: T,
  loadEn: () => Promise<unknown>
): () => T {
  let enDict: T | null = null;
  let started = false;
  const listeners = new Set<() => void>();

  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  // Snapshot = référence stable (module-scope) : `useSyncExternalStore` ne
  // boucle pas. Côté serveur on renvoie toujours null → rendu FR, identique au
  // premier rendu client, donc pas de mismatch d'hydratation.
  const getSnapshot = () => enDict;
  const getServerSnapshot = () => null;

  function preloadEn() {
    if (started || enDict) return;
    started = true;
    void loadEn()
      .then((mod) => {
        enDict = ((mod as { default?: unknown })?.default ?? mod) as T;
        listeners.forEach((notify) => notify());
      })
      .catch(() => {
        // Échec réseau : on réessaiera au prochain rendu en 'en'. Entre-temps
        // l'app reste affichée en français plutôt que cassée.
        started = false;
      });
  }

  return function useLocaleDict(): T {
    const { lang } = useLang();
    const en = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
      if (lang === 'en') preloadEn();
    }, [lang]);

    return lang === 'en' && en ? en : frDict;
  };
}
