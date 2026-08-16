import fr from './locales/fr.json';
import { createLocaleHook } from './lazyLocale';

/**
 * Source de verite des traductions : `lib/i18n/locales/fr.json` et `en.json`,
 * organisees par namespace (un par page/composant). Le francais est la langue
 * de reference ; `en.json` doit avoir exactement les memes cles (garde-fou de
 * parite : cf. `locales/parity.ts`).
 *
 * Les valeurs sont des chaines. Pour l'interpolation, on utilise des
 * marqueurs `{nom}` resolus par `format()`. Pour la pluralisation, deux cles
 * `xxx_one` / `xxx_other` selectionnees cote composant.
 *
 * `en.json` est charge PARESSEUSEMENT (chunk separe, tire seulement quand la
 * langue active passe a 'en') : cf. `lazyLocale.ts` pour le pourquoi et les
 * mesures de bundle.
 */
const usePublicDict = createLocaleHook<typeof fr>(
  fr,
  () => import('./locales/en.json')
);

/**
 * Renvoie le bloc de traductions d'un namespace pour la langue active.
 *
 *   const t = useT('profileSummary');
 *   <h2>{t.title}</h2>
 */
export function useT<NS extends keyof typeof fr>(ns: NS): (typeof fr)[NS] {
  return usePublicDict()[ns];
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
