import { createEnDictHook } from './lazyLocale';
import type { PublicNs } from './ns';

/**
 * Traductions du site PUBLIC.
 *
 * Source de verite : un fichier par namespace sous `locales/fr/<ns>.ts`, qui se
 * declare via `ns()` (cf. `ns.ts` pour le pourquoi de ce decoupage). Le
 * composant importe le namespace dont il a besoin, et lui seul :
 *
 *   import nsProfileSummary from '@/lib/i18n/locales/fr/profileSummary';
 *   const t = useT(nsProfileSummary);
 *   <h2>{t.title}</h2>
 *
 * l'anglais reste UN SEUL chunk (`locales/en/index.ts`), charge
 * paresseusement a la bascule FR→EN
 * (cf. `lazyLocale.ts`). Il doit avoir exactement les memes cles que le
 * francais — garde-fou de compilation : `locales/parity.ts`.
 *
 * Les valeurs sont des chaines. Pour l'interpolation, on utilise des marqueurs
 * `{nom}` resolus par `format()`. Pour la pluralisation, deux cles
 * `xxx_one` / `xxx_other` selectionnees cote composant.
 */
const useEnDict = createEnDictHook(() => import('./locales/en'));

/** Renvoie le bloc de traductions d'un namespace pour la langue active. */
export function useT<T>(nsDef: PublicNs<string, T>): T {
  const en = useEnDict();
  // Fallback FR si l'anglais n'est pas (encore) charge, ou si la cle manque
  // cote EN : mieux vaut afficher du francais qu'un `undefined`.
  return ((en?.[nsDef.key] as T | undefined) ?? nsDef.fr) as T;
}

/**
 * Interpolation de marqueurs `{nom}` dans une chaine traduite.
 *
 *   format(t.welcome, { name: 'Lola' }) // "Bienvenue, Lola"
 */
export function format(
  template: string,
  vars: Record<string, string | number> = {}
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? String(vars[key])
      : `{${key}}`
  );
}
