// utils/overlay/scrimResultOverlay.ts
//
// Le cœur PUR de la source « résultat de scrim » (`/overlay/scrim-result`) :
// quel scrim montrer quand l'URL dit `latest`, et comment projeter son score.
//
// Le score affiché est celui du SCRIM (`scrims.team1_score/team2_score`, posé
// quand les deux capitaines s'accordent ou quand le staff saisit le résultat),
// et le vainqueur vient de `winner_team_id` — jamais d'une comparaison
// recalculée à l'écran (même parti pris que les sources par match).

import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';

export type ScrimResultTeamRow = {
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
} | null;

export type ScrimRowForResult = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  team1: ScrimResultTeamRow;
  team2: ScrimResultTeamRow;
};

/** `final` : clos avec un score · `live` : en cours · `pending` : pas encore de résultat. */
export type ScrimResultPhase = 'final' | 'live' | 'pending';

export type OverlayScrimResultView = {
  id: string;
  name: string | null;
  slug: string | null;
  phase: ScrimResultPhase;
  scheduledAt: string | null;
  completedAt: string | null;
  /** Clos sur une égalité : aucun vainqueur, et c'est un vrai résultat. */
  draw: boolean;
  /**
   * Un score est posé en base : résultat final, ou score EN COURS mis à jour
   * par le staff pendant le match. Sans lui, l'écran n'affiche pas de chiffres.
   */
  hasScore: boolean;
  team1: OverlayTeamView | null;
  team2: OverlayTeamView | null;
};

/**
 * Au-delà, le dernier scrim clos n'est plus « le résultat du moment » : une
 * source laissée branchée ne doit pas ressortir un score d'il y a une semaine
 * au début d'un autre direct.
 */
export const RESULT_FRESH_MS = 24 * 60 * 60 * 1000;

function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function status(row: { status: string | null }): string {
  return (row.status ?? '').trim().toLowerCase();
}

/**
 * « Le scrim du moment » pour la source résultat :
 *   1. un scrim en cours (le plus récemment programmé) ;
 *   2. sinon le dernier scrim clos, s'il l'a été il y a moins de 24 h.
 * Rien d'autre : un scrim à venir n'a pas de résultat à montrer.
 */
export function pickLatestResultScrim<T extends ScrimRowForResult>(
  rows: T[],
  nowMs: number
): T | null {
  const running = rows
    .filter((r) => status(r) === 'running')
    .sort(
      (a, b) => (msOf(b.scheduled_date) ?? 0) - (msOf(a.scheduled_date) ?? 0)
    );
  if (running.length > 0) return running[0]!;

  const finals = rows
    .filter((r) => status(r) === 'completed')
    .filter((r) => {
      const at = msOf(r.completed_at);
      return at != null && nowMs - at <= RESULT_FRESH_MS;
    })
    .sort((a, b) => (msOf(b.completed_at) ?? 0) - (msOf(a.completed_at) ?? 0));
  return finals[0] ?? null;
}

function teamView(
  team: ScrimResultTeamRow,
  score: number | null,
  isWinner: boolean
): OverlayTeamView | null {
  if (!team) return null;
  return {
    name: team.name ?? '',
    shortName: team.short_name ?? null,
    logoUrl: team.logo_url ?? null,
    score: typeof score === 'number' && Number.isFinite(score) ? score : 0,
    isWinner,
  };
}

export function buildScrimResultView(
  row: ScrimRowForResult
): OverlayScrimResultView {
  const s = status(row);
  const hasScore = row.team1_score != null && row.team2_score != null;
  const phase: ScrimResultPhase =
    s === 'completed' && hasScore
      ? 'final'
      : s === 'running'
        ? 'live'
        : 'pending';
  const winner1 = !!row.winner_team_id && row.winner_team_id === row.team1_id;
  const winner2 = !!row.winner_team_id && row.winner_team_id === row.team2_id;
  return {
    id: row.id,
    name: row.name ?? null,
    slug: row.slug ?? null,
    phase,
    scheduledAt: row.scheduled_date ?? null,
    completedAt: row.completed_at ?? null,
    draw: phase === 'final' && !row.winner_team_id,
    hasScore,
    team1: teamView(row.team1, row.team1_score, phase === 'final' && winner1),
    team2: teamView(row.team2, row.team2_score, phase === 'final' && winner2),
  };
}
