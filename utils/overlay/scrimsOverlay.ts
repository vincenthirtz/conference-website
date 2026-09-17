// utils/overlay/scrimsOverlay.ts
//
// Le cœur PUR de la source « scrims à venir » (`/overlay/scrims`) : quels
// scrims publics montrer, dans quel ordre, et sous quelle forme.
//
// Pourquoi pas `GET /api/scrims` tel quel (ce que fait la scène caster
// « list ») : cette liste est triée du plus LOINTAIN au plus proche puis
// tronquée — une limite de 10 garde les 10 scrims les plus éloignés, pas les
// 10 prochains. Et un scrim resté `scheduled` après coup (personne n'a cliqué
// « terminé ») y traîne pour toujours. Une source d'antenne veut l'inverse :
// les prochains, dans l'ordre, sans fantômes.

import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';

/**
 * Un scrim `scheduled` dont l'heure est passée depuis plus longtemps que ça
 * n'est plus « à venir » : c'est un scrim joué que personne n'a clos. Trois
 * heures couvrent un BO5 qui a commencé en retard.
 */
export const STALE_SCHEDULED_MS = 3 * 60 * 60 * 1000;

export type ScrimTeamRow = {
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
} | null;

export type ScrimRowForOverlay = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  scheduled_date: string | null;
  team1: ScrimTeamRow;
  team2: ScrimTeamRow;
};

export type OverlayScrimView = {
  id: string;
  name: string | null;
  slug: string | null;
  phase: 'live' | 'upcoming';
  scheduledAt: string | null;
  team1: OverlayTeamView | null;
  team2: OverlayTeamView | null;
};

function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function teamView(team: ScrimTeamRow): OverlayTeamView | null {
  if (!team) return null;
  return {
    name: team.name ?? '',
    shortName: team.short_name ?? null,
    logoUrl: team.logo_url ?? null,
    // Pas de score ici : le score d'un scrim se calcule sur ses matchs, et une
    // liste d'agenda n'a pas à le deviner.
    score: 0,
    isWinner: false,
  };
}

/**
 * Les scrims à montrer, dans l'ordre d'antenne :
 *   1. ceux en cours (`running`) ;
 *   2. puis les programmés, du plus proche au plus lointain, dans l'horizon ;
 *   3. puis les programmés sans date.
 * Les programmés dont l'heure est dépassée depuis STALE_SCHEDULED_MS sont
 * écartés.
 */
export function selectUpcomingScrims(
  rows: ScrimRowForOverlay[],
  nowMs: number,
  horizonDays: number
): OverlayScrimView[] {
  const horizonMs = nowMs + horizonDays * 24 * 60 * 60 * 1000;
  const live: ScrimRowForOverlay[] = [];
  const dated: ScrimRowForOverlay[] = [];
  const undated: ScrimRowForOverlay[] = [];

  for (const row of rows) {
    const status = (row.status ?? '').trim().toLowerCase();
    if (status === 'running') {
      live.push(row);
      continue;
    }
    if (status !== 'scheduled') continue;
    const at = msOf(row.scheduled_date);
    if (at == null) undated.push(row);
    else if (at >= nowMs - STALE_SCHEDULED_MS && at <= horizonMs)
      dated.push(row);
  }

  const byDate = (a: ScrimRowForOverlay, b: ScrimRowForOverlay) =>
    (msOf(a.scheduled_date) ?? 0) - (msOf(b.scheduled_date) ?? 0) ||
    a.id.localeCompare(b.id);

  return [...live.sort(byDate), ...dated.sort(byDate), ...undated].map(
    (row) => ({
      id: row.id,
      name: row.name ?? null,
      slug: row.slug ?? null,
      phase:
        (row.status ?? '').trim().toLowerCase() === 'running'
          ? 'live'
          : 'upcoming',
      scheduledAt: row.scheduled_date ?? null,
      team1: teamView(row.team1),
      team2: teamView(row.team2),
    })
  );
}

/** `?days=` : horizon en jours, 1 → 60, 14 par défaut. */
export function parseScrimHorizon(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 14;
  return Math.min(60, Math.max(1, n));
}

/** `?limit=` : 1 → 10 lignes, 6 par défaut. */
export function parseScrimLimit(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 6;
  return Math.min(10, Math.max(1, n));
}
