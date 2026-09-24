// utils/overlay/dayOverride.ts
//
// Le jour FORCÉ de la source OBS « Matchs du jour » (colonnes
// tournaments.overlay_day_date / overlay_day_set_at).
//
// La source affiche le jour même ; l'admin peut lui envoyer un autre jour pour
// régler la scène avant la soirée, sans toucher à l'URL collée dans OBS. Le
// forçage EXPIRE : un test oublié la veille ne doit pas passer à l'antenne le
// lendemain.
//
// Logique PURE : aucun accès base, instant injecté.

/** Durée pendant laquelle un jour forcé est honoré. */
export const DAY_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayString(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Fin de validité d'un forçage, ou null s'il n'y en a pas. */
export function dayOverrideExpiresAt(setAt: string | null): string | null {
  if (!setAt) return null;
  const t = new Date(setAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + DAY_OVERRIDE_TTL_MS).toISOString();
}

/** Le jour forcé encore valide à `nowMs`, sinon null (= le jour même). */
export function activeDayOverride(
  row: { overlay_day_date?: string | null; overlay_day_set_at?: string | null },
  nowMs: number
): string | null {
  const day = row.overlay_day_date ?? null;
  if (!day || !isDayString(day)) return null;
  const expires = dayOverrideExpiresAt(row.overlay_day_set_at ?? null);
  if (!expires || new Date(expires).getTime() <= nowMs) return null;
  return day;
}
