// lib/i18n/lazyLocale.ts
//
// Chargement PARESSEUX du dictionnaire anglais.
//
// `LanguageProvider` rend TOUJOURS 'fr' au SSR et au premier rendu client (la
// préférence stockée n'est appliquée qu'en `useEffect`, pour éviter tout
// mismatch d'hydratation). L'anglais n'est donc jamais requis de façon
// synchrone : on le charge à la demande, en chunk séparé, à la bascule FR→EN.
//
// Il est écrit par namespace (`locales/en/<ns>.ts`, en miroir du français) mais
// livré MONOLITHIQUE : `locales/en/index.ts` les recompose, et c'est ce module
// unique qui est importé dynamiquement. Le français, lui, doit tenir dans le
// bundle de chaque page ; l'anglais est une requête unique déclenchée par un
// clic. Le livrer en chunks séparés multiplierait les requêtes sans rien
// économiser — d'où la dissociation entre la façon dont on l'ÉCRIT et la façon
// dont on le LIVRE.

import { useEffect, useSyncExternalStore } from 'react';
import { useLang } from './LanguageProvider';

/** Dictionnaire anglais chargé : blocs indexés par clé de namespace. */
export type EnDict = Record<string, unknown>;

/**
 * Fabrique un hook qui renvoie le dictionnaire anglais une fois chargé, `null`
 * tant que la langue active est le français (ou que le chargement est en vol).
 *
 * @param loadEn loader dynamique du dictionnaire anglais (`() => import('./locales/en')`)
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
