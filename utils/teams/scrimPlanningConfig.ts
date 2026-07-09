// utils/teams/scrimPlanningConfig.ts
// Petits helpers PURS de conversion entre une row `scrim_plannings` (colonnes
// snake_case) et la PlanningConfig attendue par utils/teams/scrimPlanningOverlap
// (camelCase). Extrait ici pour rester DRY entre les 4 routes qui construisent
// la grille (admin détail/validate, player détail/availability).

import type { PlanningConfig } from './scrimPlanningOverlap';

/** Sous-ensemble des colonnes d'une planning suffisant pour bâtir la config. */
export type PlanningConfigRow = {
  horizon_start: string;
  horizon_days: number;
  slot_minutes: number;
  day_start_min: number;
  day_end_min: number;
  timezone: string;
};

/** Mappe une row `scrim_plannings` vers la PlanningConfig (géométrie de grille). */
export function planningConfigFromRow(row: PlanningConfigRow): PlanningConfig {
  return {
    horizonStart: row.horizon_start,
    horizonDays: row.horizon_days,
    slotMinutes: row.slot_minutes,
    dayStartMin: row.day_start_min,
    dayEndMin: row.day_end_min,
    timezone: row.timezone,
  };
}

/**
 * Date calendaire du jour ('YYYY-MM-DD') dans le fuseau donné. Sert de défaut à
 * `horizon_start` quand la création n'en fournit pas. Basé sur Intl (robuste au
 * fuseau de la machine).
 */
export function todayInTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
