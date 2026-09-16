// utils/dates/formatMatchDateTime.ts
//
// L'heure d'un match, telle qu'on la LIT dans l'espace joueur.
//
// Pourquoi un module : cinq écrans formataient la même date chacun à leur
// manière, et deux d'entre eux (le fil du match, l'agenda) oubliaient
// `timeZone`. Un `toLocaleString` sans fuseau rend l'heure du TÉLÉPHONE : une
// joueuse en déplacement à Montréal lisait « 13:00 » pour un match à 19:00, et
// le même rendu sur le serveur Netlify (UTC) produisait un mismatch
// d'hydratation. Le calendrier du tournoi est en heure de Paris, les annonces
// Discord aussi : l'écran doit dire la même chose qu'elles.
//
// Les préréglages sont nommés par USAGE plutôt que par options : deux écrans
// qui affichent « la date du match » doivent l'afficher pareil, et c'est plus
// facile à garantir avec `'long'` qu'avec cinq options recopiées.

import { formatSiteDate, SITE_TIMEZONE } from '@/utils/timezone';

export type MatchDateStyle =
  /** « vendredi 18 septembre, 19:00 » — l'affiche d'un match. */
  | 'long'
  /** « ven. 18, 19:00 » — une ligne d'agenda, colonne étroite. */
  | 'agenda'
  /** « 19:00 » — un horaire dans une phrase qui a déjà le jour. */
  | 'time'
  /** « 18/09/2026 19:00 » — un horodatage (validation, check-in). */
  | 'stamp'
  /** « 18/09/2026 » — une date sans heure. */
  | 'date';

const PRESETS: Record<MatchDateStyle, Intl.DateTimeFormatOptions> = {
  long: {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  },
  agenda: {
    weekday: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
  time: { hour: '2-digit', minute: '2-digit' },
  stamp: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
};

/** Le fuseau dans lequel toute heure de match est affichée. */
export const MATCH_TIMEZONE = SITE_TIMEZONE;

/**
 * Formate `iso` dans le fuseau de Paris, quel que soit celui du processus.
 *
 * `locale` accepte `fr`/`en` comme `fr-FR`/`en-GB` (cf. `formatSiteDate`).
 * Renvoie `fallback` pour une date absente ou invalide : un « Invalid Date »
 * affiché à une capitaine le soir du match ne l'aide pas.
 */
export function formatMatchDateTime(
  iso: string | Date | null | undefined,
  locale: string,
  style: MatchDateStyle = 'long',
  fallback = ''
): string {
  return formatSiteDate(iso, locale, PRESETS[style], fallback);
}
