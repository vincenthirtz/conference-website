// features/player/library/arena/week.ts — LA SEMAINE de la récompense d'arène.
//
// « Un paquet par semaine » : la semaine ISO 8601 (lundi → dimanche) À L'HEURE
// DE PARIS, celle du moment où le duel se TERMINE. C'est la base qui tranche
// (`library_arena_claim_weekly_pack`, `to_char(ended_at AT TIME ZONE
// 'Europe/Paris', 'IYYY-"W"IW')`, clé primaire de `library_arena_rewards`) ;
// ce module ne sert qu'à DIRE au salon si le paquet de la semaine en cours est
// déjà gagné. Les deux calculs doivent donner le même libellé : le test
// `libraryArenaEngine.test.ts` les confronte aux bascules (dimanche 23 h 30,
// lundi 0 h 30, heure d'été, 53ᵉ semaine).

import { getWallClockParts } from '../../../../utils/timezone';

export const ARENA_WEEK_TIMEZONE = 'Europe/Paris';

/** `YYYY-Www` : le format de `library_arena_rewards.iso_week`. */
export const ARENA_WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** Semaine ISO d'une date de calendrier (`YYYY-MM-DD`). */
export function isoWeekOfDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Le jeudi de la semaine décide de l'année ISO.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const week = Math.ceil(
    ((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** La semaine de l'arène d'un instant : sa date murale à Paris, puis ISO. */
export function arenaWeekOf(instant: Date): string {
  return isoWeekOfDate(getWallClockParts(instant, ARENA_WEEK_TIMEZONE).date);
}
