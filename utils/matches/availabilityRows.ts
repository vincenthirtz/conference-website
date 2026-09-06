// utils/matches/availabilityRows.ts
// Le pont entre la table `team_availability_constraints` et la logique pure
// d'`availability.ts`. Séparé des deux exprès : la logique ne doit rien savoir
// de PostgREST, et les routes ne doivent pas chacune réinventer la conversion.

import type {
  AvailabilityConstraint,
  AvailabilityConstraintKind,
} from './availability';

export const AVAILABILITY_COLUMNS =
  'id, tenant_id, team_id, tournament_id, kind, starts_on, ends_on, time_of_day, weekdays, timezone, note, created_at, updated_at, created_by';

export interface AvailabilityRow {
  id: string;
  tenant_id: string;
  team_id: string;
  tournament_id: string | null;
  kind: AvailabilityConstraintKind;
  starts_on: string | null;
  ends_on: string | null;
  time_of_day: string | null;
  weekdays: number[] | null;
  timezone: string | null;
  note: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export function rowToConstraint(row: AvailabilityRow): AvailabilityConstraint {
  return {
    id: row.id,
    teamId: row.team_id,
    tournamentId: row.tournament_id,
    kind: row.kind,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    // Postgres rend un `time` en `HH:MM:SS` ; la logique accepte les deux, mais
    // l'UI n'a que faire des secondes d'une heure de coup d'envoi.
    timeOfDay: row.time_of_day ? row.time_of_day.slice(0, 5) : null,
    weekdays: row.weekdays,
    timezone: row.timezone,
    note: row.note,
  };
}

const WEEKDAY_SHORT = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/**
 * La contrainte en une phrase, telle qu'on la relit dans une liste.
 *
 * Volontairement sans le nom de l'équipe : l'endroit où on l'affiche le porte
 * déjà, et le répéter allongerait chaque ligne d'un tableau qui en compte huit.
 */
export function describeConstraint(c: AvailabilityConstraint): string {
  switch (c.kind) {
    case 'blackout':
      if (!c.startsOn || !c.endsOn) return 'Indisponibilité (dates manquantes)';
      return c.startsOn === c.endsOn
        ? `Indisponible le ${c.startsOn}`
        : `Indisponible du ${c.startsOn} au ${c.endsOn}`;
    case 'earliest':
      return `Pas de match avant ${c.timeOfDay ?? '?'}`;
    case 'latest':
      return `Pas de match après ${c.timeOfDay ?? '?'}`;
    case 'weekday': {
      const days = (c.weekdays ?? []).map((d) => WEEKDAY_SHORT[d] ?? `jour ${d}`);
      if (days.length === 0) return 'Indisponible (jours manquants)';
      if (days.length === 1) return `Indisponible le ${days[0]}`;
      const last = days[days.length - 1];
      return `Indisponible le ${days.slice(0, -1).join(', ')} et le ${last}`;
    }
    default:
      return 'Contrainte inconnue';
  }
}
