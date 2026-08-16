import fr from './locales/admin-fr.json';
import { createLocaleHook } from './lazyLocale';

/**
 * i18n de l'espace ADMIN (staff-only, `pages/admin/*` + `components/admin/*`).
 *
 * Séparé du dictionnaire public (`useT` / `locales/{fr,en}.json`) pour deux
 * raisons :
 *  - **Bundle** : y verser les milliers de clés admin dans le dictionnaire
 *    public les embarquerait dans le chunk de CHAQUE page publique. Ici les
 *    locales admin ne sont tirées que par les pages admin.
 *  - **Traduction différée** : on a pu câbler tout l'admin sur `useAdminT`
 *    avant que la traduction EN existe. La parité de structure est garantie
 *    par le garde-fou de compilation (cf. `locales/admin-parity.ts`).
 *
 * Comme pour `useT`, `admin-en.json` est chargé PARESSEUSEMENT (chunk séparé,
 * tiré seulement quand la langue active passe à 'en') : cf. `lazyLocale.ts`.
 *
 * Même API que `useT` : `useAdminT('namespace')` renvoie le bloc de la langue
 * active ; `format()` (ré-exporté) interpole les marqueurs `{nom}`.
 */
const useAdminDict = createLocaleHook<typeof fr>(
  fr,
  () => import('./locales/admin-en.json')
);

export function useAdminT<NS extends keyof typeof fr>(ns: NS): (typeof fr)[NS] {
  return useAdminDict()[ns];
}

export { format } from './useT';
