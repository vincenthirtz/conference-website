import { localeTag } from '@/lib/i18n/useLocale';
import type { Lang } from '@/lib/i18n/LanguageProvider';

/**
 * Formate une plage de dates de tournoi, localisée à la fois pour la locale
 * `Intl` (via `localeTag(lang)`) et pour les connecteurs textuels ("Du … au …",
 * "À partir du …", etc.).
 *
 * Fonction PURE (aucun hook) : utilisable au rendu visible comme côté serveur
 * (SEO dans getServerSideProps/getStaticProps).
 *
 * Renvoie `null` si aucune borne n'est fournie.
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  lang: Lang
): string | null {
  if (!start && !end) return null;

  const locale = localeTag(lang);
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
  };

  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    const sLabel = s.toLocaleDateString(locale, opts);
    const eLabel = e.toLocaleDateString(locale, opts);
    if (s.getTime() === e.getTime()) {
      return lang === 'fr' ? `Le ${sLabel}` : `On ${sLabel}`;
    }
    return lang === 'fr'
      ? `Du ${sLabel} au ${eLabel}`
      : `From ${sLabel} to ${eLabel}`;
  }

  if (start) {
    const sLabel = new Date(start).toLocaleDateString(locale, opts);
    return lang === 'fr' ? `À partir du ${sLabel}` : `From ${sLabel}`;
  }

  const eLabel = new Date(end!).toLocaleDateString(locale, opts);
  return lang === 'fr' ? `Jusqu'au ${eLabel}` : `Until ${eLabel}`;
}
