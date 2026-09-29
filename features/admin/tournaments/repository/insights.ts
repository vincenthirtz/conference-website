// features/admin/tournaments/repository/insights.ts — lectures des écrans
// d'analyse d'un tournoi : historique staff, statistiques, analytics, votes
// MVP, podium, export. Lecture seule ; `tenantId` obligatoire partout.

import type { AdminDb } from '@/utils/admin/serviceContext';

/* ---- Historique staff ---- */

export async function tournamentLogs(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  f: { entityType: string | null; action: string | null; limit: number }
) {
  let query = db
    .from('staff_logs')
    .select(
      `
        id,
        created_at,
        staff_id,
        action,
        entity_type,
        entity_id,
        tournament_id,
        payload,
        staff:staff!fk_staff_logs_staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
    .limit(f.limit);
  if (f.entityType) query = query.eq('entity_type', f.entityType);
  if (f.action) query = query.eq('action', f.action);
  return query;
}

/* ---- Matchs, jeux, équipes ---- */

export async function matchesForAnalytics(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select('id, team1_id, team2_id, winner_team_id, status, is_bye')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
}

export async function gamesForAnalytics(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('games')
    .select(
      'match_id, map_name, map_order, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime, picked_by_team_id, hero_bans'
    )
    .in('match_id', matchIds)
    .eq('tenant_id', tenantId);
}

export async function vetosForAnalytics(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('match_map_vetos')
    .select('match_id, step_number, action, team_id, map_name')
    .in('match_id', matchIds)
    .eq('tenant_id', tenantId);
}

export async function draftsForAnalytics(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('match_drafts')
    .select('id, match_id, game_index')
    .in('match_id', matchIds)
    .eq('tenant_id', tenantId);
}

/** Étapes de draft : sans colonne tenant, bornées par les drafts du tenant. */
export async function draftSteps(db: AdminDb, draftIds: string[]) {
  return db
    .from('match_draft_steps')
    .select('draft_id, action, side, hero_id, phase')
    .in('draft_id', draftIds);
}

/** Référentiel global des héros (pas de tenant). */
export async function heroNames(db: AdminDb, ids: string[]) {
  return db.from('game_heroes').select('id, name').in('id', ids);
}

export async function teamNames(db: AdminDb, tenantId: string, ids: string[]) {
  return db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
}

export async function teamCards(db: AdminDb, tenantId: string, ids: string[]) {
  return db
    .from('teams')
    .select('id, name, short_name, logo_url')
    .in('id', ids)
    .eq('tenant_id', tenantId);
}

export async function matchesForStats(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select(
      `id, tournament_id, stage_id, status, is_bye, team1_id, team2_id,
         team1_score, team2_score, winner_team_id, round_number,
         stage:stage_id(name)`
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
}

export async function entrantCards(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_teams')
    .select('team:team_id(id, name, short_name, logo_url)')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
}

export async function gamesForStats(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('games')
    .select(
      'match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime'
    )
    .in('match_id', matchIds)
    .eq('tenant_id', tenantId);
}

/* ---- Votes MVP ---- */

export async function matchesForVotes(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select('id, round_name, scheduled_at, status, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
}

export async function teamPolls(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('match_mvp_polls')
    .select(
      'match_id, posted_at, closes_at, closed_at, winner_member_id, winner_source, winner_votes, total_votes'
    )
    .eq('tenant_id', tenantId)
    .in('match_id', matchIds);
}

export async function publicPolls(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  return db
    .from('match_public_mvp_polls')
    .select(
      'match_id, opened_at, closes_at, closed_at, winner_member_id, winner_votes, total_votes'
    )
    .eq('tenant_id', tenantId)
    .in('match_id', matchIds);
}

export async function membersWithTeam(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  return db
    .from('team_members')
    .select('id, display_name, battle_tag, team:teams(name)')
    .eq('tenant_id', tenantId)
    .in('id', ids);
}

/* ---- Podium ---- */

export async function entrantIds(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
}

export async function lastStage(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_stages')
    .select('id, stage_type, order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: false })
    .limit(1);
}

/**
 * Palmarès figé. `final_rankings` est lu par tournoi : le tournoi a déjà été
 * vérifié dans le tenant par l'appelant.
 */
export async function frozenRankings(db: AdminDb, tournamentId: string) {
  return db
    .from('final_rankings')
    .select('team_id, rank, prize, notes, frozen_at, teams:teams!inner(name)')
    .eq('tournament_id', tournamentId)
    .order('rank', { ascending: true });
}

export async function finishedStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  return db
    .from('matches')
    .select(
      'id, round_number, round_name, bracket_side, team1_id, team2_id, winner_team_id, status'
    )
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .eq('status', 'finished');
}

/* ---- Export ---- */

export async function stagesForExport(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_stages')
    .select('id, name, stage_type, order_index')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .order('order_index', { ascending: true });
}

export async function matchesForExport(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select(
      'id, stage_id, status, round_number, round_name, bracket_side, team1_id, team2_id, team1_score, team2_score, winner_team_id, scheduled_at, completed_at, match_format, best_of, is_bye'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true, nullsFirst: false });
}
