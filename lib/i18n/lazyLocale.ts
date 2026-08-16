// lib/i18n/lazyLocale.ts
//
// Chargement PARESSEUX du dictionnaire anglais.
//
// `LanguageProvider` rend TOUJOURS 'fr' au SSR et au premier rendu client (la
// préférence stockée n'est appliquée qu'en `useEffect`, pour éviter tout
// mismatch d'hydratation). L'anglais n'est donc jamais requis de façon
// synchrone : on le charge à la demande, en chunk séparé, à la bascule FR→EN.
//
// Il reste volontairement MONOLITHIQUE (un `en.json`, un `admin-en.json`),
// contrairement au français qui est éclaté par namespace (cf. `ns.ts`) : le
// français doit tenir dans le bundle de chaque page, l'anglais est une requête
// unique déclenchée par un clic. Le découper multiplierait les requêtes sans
// rien économiser.

import { useEffect, useSyncExternalStore } from 'react';
import { useLang } from './LanguageProvider';

/** Dictionnaire anglais chargé : blocs indexés par clé de namespace. */
export type EnDict = Record<string, unknown>;

/**
 * Fabrique un hook qui renvoie le dictionnaire anglais une fois chargé, `null`
 * tant que la langue active est le français (ou que le chargement est en vol).
 *
 * @param loadEn loader dynamique du blob anglais (`() => import('./en.json')`)
 */
export function createEnDictHook(
  loadEn: () => Promise<unknown>
): () => EnDict | null {
  let enDict: EnDict | null = null;
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
        enDict = ((mod as { default?: unknown })?.default ?? mod) as EnDict;
        listeners.forEach((notify) => notify());
      })
      .catch(() => {
        // Échec réseau : on réessaiera au prochain rendu en 'en'. Entre-temps
        // l'app reste affichée en français plutôt que cassée.
        started = false;
      });
  }

  return function useEnDict(): EnDict | null {
    const { lang } = useLang();
    const en = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
      if (lang === 'en') preloadEn();
    }, [lang]);

    return lang === 'en' ? en : null;
  };
}
