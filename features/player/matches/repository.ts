// features/player/matches/repository.ts — lectures et écritures des matchs de
// la joueuse (liste, fil du match, déclaration de score). Toujours scopées au
// tenant. Requêtes reprises À L'IDENTIQUE des routes historiques (mêmes
// colonnes, mêmes filtres) : ce lot déplace, il ne change pas de règle.
//
// Les résultats restent faiblement typés (`Record<string, unknown>`) comme
// avant : les dérivations (utils/matches/playerMatchView.ts) travaillent sur
// cette forme, partagée avec /api/player/next-match.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { PLAYER_MATCH_SELECT } from '@/utils/matches/playerMatchView';

/** Client non typé : sélections avec jointures PostgREST, comme l'historique. */
const loose = (db: AdminDb) => db as unknown as SupabaseClient;

/* ------------------------------ Liste -------------------------------- */

export async function readTeamWithCaptain(db: AdminDb, teamId: string) {
  const { data } = await loose(db)
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', teamId)
    .maybeSingle();
  return data as { id: string; name: string; captain_id: string | null } | null;
}

export async function listTeamMatches(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await loose(db)
    .from('matches')
    .select(PLAYER_MATCH_SELECT)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(100);
  return { rows: (data ?? []) as Record<string, unknown>[], error };
}

/* --------------------------- Fil du match ---------------------------- */

export async function readPlayerMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await loose(db)
    .from('matches')
    .select(PLAYER_MATCH_SELECT)
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { match: data as Record<string, unknown> | null, error };
}

export async function countRoster(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { count, error } = await loose(db)
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return { count: (count as number | null) ?? 0, error };
}

export type ScoreReportRow = {
  team_side: number;
  team1_score: number;
  team2_score: number;
  reported_at?: string;
  updated_at?: string;
};

export async function readScoreReports(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  columns = 'team_side, team1_score, team2_score'
) {
  const { data, error } = await loose(db)
    .from('match_score_reports')
    .select(columns)
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  return { reports: (data ?? null) as ScoreReportRow[] | null, error };
}

export async function readTeamCaptainId(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data } = await loose(db)
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as { captain_id?: string | null } | null)?.captain_id ?? null;
}

/* ---------------------- Déclaration de score ------------------------- */

export async function readMatchForReport(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await loose(db)
    .from('matches')
    .select(
      `id, tournament_id, scrim_id, status, is_bye,
       scheduled_at, best_of, match_format, dispute_opened_by,
       team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id),
       tournament:tournament_id (id, name)`
    )
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  return { match: data as Record<string, unknown> | null, error };
}

/** Upsert idempotent sur (match_id, team_side) : on corrige son report. */
export async function upsertScoreReport(
  db: AdminDb,
  row: {
    tenantId: string;
    matchId: string;
    side: 1 | 2;
    userId: string;
    team1Score: number;
    team2Score: number;
  }
) {
  const { error } = await loose(db).from('match_score_reports').upsert(
    {
      tenant_id: row.tenantId,
      match_id: row.matchId,
      team_side: row.side,
      reported_by_auth_user_id: row.userId,
      discord_user_id: null,
      team1_score: row.team1Score,
      team2_score: row.team2Score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'match_id,team_side' }
  );
  return { error };
}

/**
 * Referme une dispute CAPITAINES avant finalisation. Conditionnel au statut
 * `disputed` ET à `dispute_opened_by IS NULL` : jamais une dispute staff.
 */
export async function clearCaptainDispute(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const nowIso = new Date().toISOString();
  const { error } = await loose(db)
    .from('matches')
    .update({
      status: 'pending',
      dispute_resolution:
        'Resolu automatiquement : les deux capitaines ont accorde leur report.',
      dispute_resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .eq('status', 'disputed')
    .is('dispute_opened_by', null);
  return { error };
}

/** Ouvre la dispute, conditionnel au statut LU (`fromStatus`). */
export async function openCaptainDispute(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  fromStatus: string,
  reason: string
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await loose(db)
    .from('matches')
    .update({
      status: 'disputed',
      dispute_reason: reason,
      dispute_opened_by: null,
      dispute_opened_at: nowIso,
      dispute_resolution: null,
      dispute_resolved_by: null,
      dispute_resolved_at: null,
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .eq('status', fromStatus)
    .select('id')
    .maybeSingle();
  return { row: data as { id: string } | null, error };
}

export async function readMatchOutcome(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await loose(db)
    .from('matches')
    .select('status, team1_score, team2_score, winner_team_id')
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  return data as {
    status: string;
    team1_score: number | null;
    team2_score: number | null;
    winner_team_id: string | null;
  } | null;
}
