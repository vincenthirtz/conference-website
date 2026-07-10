// utils/teams/scrimTime.ts
// Helpers de formatage date/heure PARTAGÉS par les surfaces scrim (grille de
// dispos, agenda admin, picker de négociation) — DRY après A6a/A6b. Purs, sans
// dépendance Supabase. La conversion heure-murale ↔ UTC (DST-safe) vit dans
// scrimPlanningOverlap.slotKey / scrimCalendar.zonedTimeToUtcIso ; ici on ne
// s'occupe que du FORMATAGE d'affichage.

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Minute-de-jour (depuis minuit) → 'HH:mm'. */
export function fmtHourOfDay(minuteOfDay: number): string {
  return `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/**
 * Instant ISO → date lisible « lun. 15 juil. 20:00 ». `locale` et `timeZone`
 * optionnels (défaut : locale/fuseau du runtime). Renvoie '' si la date est
 * invalide. Format aligné sur l'écho du picker de négociation et le pied de la
 * grille de dispos.
 */
export function formatInstant(
  iso: string,
  opts: { locale?: string; timeZone?: string } = {}
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(opts.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: opts.timeZone,
  });
}
