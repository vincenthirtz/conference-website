// utils/seasonalLogo.ts
//
// LOGOS SAISONNIERS — Octobre rose, Halloween, Noël…
//
// Un logo d'événement remplace le logo par défaut du site PENDANT une plage de
// dates, puis s'efface de lui-même. C'est tout l'intérêt de programmer plutôt
// que de basculer à la main : le logo rose ne doit pas rester en ligne le
// 3 novembre parce que personne n'a pensé à le retirer, et le logo de Noël
// peut être posé dès qu'il arrive, sans attendre le 1er décembre.
//
// POURQUOI PAS `tenants.logo_url`. C'est le logo de la MARQUE BLANCHE : dès
// qu'il est renseigné, le site se considère comme tournant pour un autre
// organisateur (pulse live coupé, image non optimisée). Un événement de la Cup
// n'est pas un changement d'organisateur.
//
// Stocké en JSON dans `site_settings` (clé `seasonal_logos`), scopé tenant.
// Module PUR : aucune dépendance serveur, testable tel quel.

import * as z from 'zod';

export const SEASONAL_LOGOS_SETTING_KEY = 'seasonal_logos';

/** Au-delà, ce n'est plus un calendrier d'événements mais un inventaire. */
export const SEASONAL_LOGOS_MAX = 24;

/**
 * Fuseau de référence. Les dates saisies sont des JOURS du calendrier de la
 * Cup : « jusqu'au 31 octobre » veut dire jusqu'à minuit à Paris, pas à Londres
 * ni à l'heure du serveur Netlify (UTC).
 */
export const SEASONAL_LOGO_TIMEZONE = 'Europe/Paris';

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * L'image s'affiche dans la navbar de TOUTES les pages : https (Supabase
 * Storage, où atterrit l'upload) ou chemin du site. Jamais `http:`, `data:` ni
 * `javascript:`.
 */
function isSafeLogoUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const SeasonalLogoSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[\w-]{1,40}$/),
    name: z.string().trim().min(1).max(60),
    url: z.string().trim().min(1).max(500).refine(isSafeLogoUrl, {
      message: 'URL https ou chemin du site attendu.',
    }),
    startDate: z.string().regex(DAY_RE),
    endDate: z.string().regex(DAY_RE),
    enabled: z.boolean(),
  })
  // Comparaison de chaînes : le format AAAA-MM-JJ est ordonné comme les dates.
  .refine((l) => l.endDate >= l.startDate, {
    message: 'La date de fin précède la date de début.',
    path: ['endDate'],
  });

export type SeasonalLogo = z.infer<typeof SeasonalLogoSchema>;

export const SeasonalLogoListSchema = z
  .array(SeasonalLogoSchema)
  .max(SEASONAL_LOGOS_MAX)
  .refine((list) => new Set(list.map((l) => l.id)).size === list.length, {
    message: 'Identifiants en double.',
  });

/**
 * Relit la valeur stockée. Une valeur absente ou corrompue rend une liste
 * VIDE — donc le logo par défaut — plutôt qu'une erreur : un réglage cassé ne
 * doit jamais retirer le logo du site.
 */
export function parseSeasonalLogos(
  raw: string | null | undefined
): SeasonalLogo[] {
  if (!raw) return [];
  try {
    const parsed = SeasonalLogoListSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** Le jour calendaire courant à Paris, au format AAAA-MM-JJ. */
export function todayInParis(now: Date = new Date()): string {
  // `en-CA` formate nativement en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEASONAL_LOGO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export type SeasonalLogoStatus = 'active' | 'scheduled' | 'ended' | 'disabled';

/** Bornes INCLUSES : le logo est encore là le jour de fin, jusqu'à minuit. */
export function seasonalLogoStatus(
  logo: Pick<SeasonalLogo, 'startDate' | 'endDate' | 'enabled'>,
  today: string
): SeasonalLogoStatus {
  if (!logo.enabled) return 'disabled';
  if (today < logo.startDate) return 'scheduled';
  if (today > logo.endDate) return 'ended';
  return 'active';
}

/**
 * Le logo à afficher aujourd'hui, ou `null` (→ logo par défaut).
 *
 * CHEVAUCHEMENT : le plus récemment commencé l'emporte. Un événement ponctuel
 * posé au milieu d'un événement long (une soirée spéciale pendant Octobre rose)
 * doit se voir, puis rendre la main au long quand il se termine.
 */
export function pickActiveSeasonalLogo(
  logos: SeasonalLogo[],
  today: string
): SeasonalLogo | null {
  let best: SeasonalLogo | null = null;
  for (const logo of logos) {
    if (seasonalLogoStatus(logo, today) !== 'active') continue;
    if (!best || logo.startDate > best.startDate) best = logo;
  }
  return best;
}
