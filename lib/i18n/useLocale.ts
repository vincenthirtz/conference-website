import { useLang, type Lang } from './LanguageProvider';

/**
 * Étiquette de locale BCP-47 pour les formatteurs `Intl` (dates, nombres,
 * listes). Dérivée de la langue active de l'app : `fr` → `fr-FR`, `en` →
 * `en-GB`. Le fuseau horaire, lui, reste géré séparément (Europe/Paris ; cf.
 * `utils/timezone.ts`).
 *
 *   const locale = useLocale();
 *   date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
 *
 * Pour les helpers hors composant (module-scope), passer la langue et utiliser
 * `localeTag(lang)` afin d'éviter d'appeler le hook en dehors du rendu.
 */
export function localeTag(lang: Lang): 'fr-FR' | 'en-GB' {
  return lang === 'fr' ? 'fr-FR' : 'en-GB';
}

export function useLocale(): 'fr-FR' | 'en-GB' {
  const { lang } = useLang();
  return localeTag(lang);
}
