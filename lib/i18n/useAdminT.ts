import { useLang } from './LanguageProvider';
import fr from './locales/admin-fr.json';
import en from './locales/admin-en.json';

/**
 * i18n de l'espace ADMIN (staff-only, `pages/admin/*` + `components/admin/*`).
 *
 * Séparé du dictionnaire public (`useT` / `locales/{fr,en}.json`) pour deux
 * raisons :
 *  - **Bundle** : `useT` importe statiquement les locales publiques ; y verser
 *    les milliers de clés admin les embarquerait dans le chunk de CHAQUE page
 *    publique. Ici les locales admin ne sont tirées que par les pages admin.
 *  - **Traduction différée** : l'admin est francophone. On câble tout sur
 *    `useAdminT` maintenant, mais `admin-en.json` est pour l'instant un miroir
 *    à l'identique de `admin-fr.json` (même valeurs FR). La parité de structure
 *    est garantie (cf. `locales/admin-parity.ts`) ; la traduction EN viendra
 *    plus tard sans toucher aux composants.
 *
 * Même API que `useT` : `useAdminT('namespace')` renvoie le bloc de la langue
 * active ; `format()` (ré-exporté) interpole les marqueurs `{nom}`.
 */
const locales: { fr: typeof fr; en: typeof fr } = {
  fr,
  en: en as typeof fr,
};

export function useAdminT<NS extends keyof typeof fr>(ns: NS): (typeof fr)[NS] {
  const { lang } = useLang();
  return locales[lang][ns];
}

export { format } from './useT';
