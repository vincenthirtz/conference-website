// features/admin/matches/repository/reads.ts — lectures annexes d'un match
// côté staff : historique (journal), analytique, pool de cartes, recherche,
// relance de check-in. `tenantId` OBLIGATOIRE partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { MATCH_SEARCH_COLUMNS, STAFF_LOG_WITH_STAFF_COLUMNS } from '../schemas';

/* ---- Historique : trois sources de journal ---- */

export async function listMatchHistoryLogs(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const base = () =>
    db
      .from('staff_logs')
      .select(STAFF_LOG_WITH_STAFF_COLUMNS)
      .eq('tenant_id', tenantId);
  // 1) Attachés au match.
  const matchLogs = await base()
    .eq('entity_type', 'match')
    .eq('entity_id', matchId)
    .order('created_at', { ascending: false });
  // 2) Parties du match (entity_type = game, payload.match_id).
  const gameLogs = await base()
    .eq('entity_type', 'game')
    .contains('payload', { match_id: matchId })
    .order('created_at', { ascending: false });
  // 3) Déplacements décidés depuis le planning du tournoi : journalisés une
  //    fois par GESTE, attachés au tournoi, relus depuis chaque match.
  const moveLogs = await base()
    .eq('action', 'match_rescheduled')
    .contains('payload', { match_ids: [matchId] })
    .order('created_at', { ascending: false });
  return { matchLogs, gameLogs, moveLogs };
}

/* ---- Analytique ---- */

export async function getMatchTeams(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('matches')
    .select('id, team1_id, team2_id, winner_team_id, status')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function readMatchAnalyticsSources(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const [games, vetos, drafts] = await Promise.all([
    db
      .from('games')
      .select(
        'match_id, map_name, map_order, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime'
      )
      .eq('match_id', matchId)
      .eq('tenant_id', tenantId),
    db
      .from('match_map_vetos')
      .select('match_id, step_number, action, team_id, map_name')
      .eq('match_id', matchId)
      .eq('tenant_id', tenantId),
    db
      .from('match_drafts')
      .select('id, game_index')
      .eq('match_id', matchId)
      .eq('tenant_id', tenantId),
  ]);
  return { games, vetos, drafts };
}

/** Étapes des drafts (scopées par les ids de drafts, eux-mêmes scopés). */
export async function listDraftSteps(db: AdminDb, draftIds: string[]) {
  const { data, error } = await db
    .from('match_draft_steps')
    .select('draft_id, action, side, hero_id, phase')
    .in('draft_id', draftIds);
  return { rows: data, error };
}

/** Catalogue global des héros (pas de tenant). */
export async function listHeroNames(db: AdminDb, heroIds: string[]) {
  const { data } = await db
    .from('game_heroes')
    .select('id, name')
    .in('id', heroIds);
  return data ?? [];
}

/* ---- Pool de cartes ---- */

export async function getMatchForMapPool(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  // Un match appartient à un tournoi OU à un scrim : le jeu vient de l'un ou
  // de l'autre.
  const { data, error } = await db
    .from('matches')
    .select(
      'tournament_id, round_number, scheduled_at, tournament:tournaments(game), scrim:scrims(game)'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/* ---- Recherche ---- */

export async function findTeamAndTournamentIds(
  db: AdminDb,
  tenantId: string,
  pattern: string
) {
  const [teams, tournaments] = await Promise.all([
    db
      .from('teams')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`name.ilike.${pattern},short_name.ilike.${pattern}`)
      .limit(50),
    db
      .from('tournaments')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .limit(50),
  ]);
  return { teams, tournaments };
}

export async function searchMatches(
  db: AdminDb,
  tenantId: string,
  f: { upcomingSince: string | null; orClauses: string | null; limit: number }
) {
  let query = db
    .from('matches')
    .select(MATCH_SEARCH_COLUMNS)
    .eq('tenant_id', tenantId);
  if (f.upcomingSince) {
    // Les matchs sans planning sont à programmer : pertinents aussi.
    query = query.or(
      `scheduled_at.gte.${f.upcomingSince},scheduled_at.is.null`
    );
  }
  if (f.orClauses) query = query.or(f.orClauses);
  const { data, error } = await query
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(f.limit);
  return { rows: data, error };
}

/* ---- Relance de check-in ---- */

export async function getMatchForNudge(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select(
      'id, tournament_id, status, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token, scheduled_at'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function setCheckinTokens(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  tokens: { team1_checkin_token?: string; team2_checkin_token?: string }
) {
  const { error } = await db
    .from('matches')
    .update(tokens)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}
