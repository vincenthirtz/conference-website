// features/admin/stages/repository/related.ts — tables lues ou écrites
// autour d'une phase : tournoi, équipes et effectifs, ratings, journal staff,
// lobbies FFA, snapshots de bracket, overrides de départage.
//
// Mêmes requêtes que les routes d'origine (colonnes, filtres, ordre).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';
import { LOBBY_COLUMNS, TIEBREAKER_OVERRIDE_COLUMNS } from '../schemas';

/* ------------------------------ tournoi -------------------------------- */

/** Statut du tournoi, SANS filtre d'espace (batch-scores d'origine). */
export async function tournamentStatusUnscoped(db: AdminDb, id: string) {
  const { data } = await db
    .from('tournaments')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function tournamentSummary(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id, name, slug')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function tournamentMinPlayers(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id, min_players')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/* ------------------------- équipes et effectifs ------------------------ */

export async function teamsLite(db: AdminDb, tenantId: string, ids: string[]) {
  const { data } = await db
    .from('teams')
    .select('id, name, short_name, logo_url')
    .in('id', ids)
    .eq('tenant_id', tenantId);
  return data ?? [];
}

export async function teamNames(db: AdminDb, tenantId: string, ids: string[]) {
  const { data } = await db
    .from('teams')
    .select('id, name, short_name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

export async function existingTeamIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { ids: (data ?? []).map((t) => t.id), error };
}

export async function teamMembers(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return data ?? [];
}

/** Joueuses déjà inscrites dans l'une des `teamIds` (avec le nom d'équipe). */
export async function overlappingMembers(
  db: AdminDb,
  tenantId: string,
  teamIds: string[],
  userIds: string[]
) {
  const { data } = await db
    .from('team_members')
    .select('user_id, team_id, teams!inner(name)')
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds)
    .in('user_id', userIds);
  return data;
}

export async function teamRatings(
  db: AdminDb,
  tenantId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('team_ratings')
    .select('team_id, rating, rd, games_played')
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds);
  return data ?? [];
}

/* ---------------------------- journal staff ---------------------------- */

const STAGE_LOG_COLUMNS = `
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
      ` as const;

/** Entrées rattachées à la phase (`entity_type = 'stage'`). */
export async function stageLogs(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  f: { action: string | null; limit: number }
) {
  let query = db
    .from('staff_logs')
    .select(STAGE_LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'stage')
    .eq('entity_id', stageId);
  if (f.action) query = query.eq('action', f.action);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(f.limit);
  return { rows: data, error };
}

/** Entrées d'autres entités qui citent la phase (`payload.stage_id`). */
export async function payloadStageLogs(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  f: { entityType: string | null; action: string | null; limit: number }
) {
  let query = db
    .from('staff_logs')
    .select(STAGE_LOG_COLUMNS)
    .eq('tenant_id', tenantId)
    .contains('payload', { stage_id: stageId });
  if (f.entityType) query = query.eq('entity_type', f.entityType);
  if (f.action) query = query.eq('action', f.action);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(f.limit);
  return { rows: data, error };
}

/* ----------------------------- lobbies FFA ----------------------------- */

export async function stageLobbies(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('lobbies')
    .select(LOBBY_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .order('round_number', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });
  return { rows: data, error };
}

export async function lobbyPlacements(
  db: AdminDb,
  tenantId: string,
  lobbyIds: string[]
) {
  const { data, error } = await db
    .from('lobby_placements')
    .select(
      'id, lobby_id, team_id, placement, points, score, team:team_id(id, name, logo_url, short_name)'
    )
    .eq('tenant_id', tenantId)
    .in('lobby_id', lobbyIds);
  return { rows: data, error };
}

export async function insertLobby(db: AdminDb, row: TablesInsert<'lobbies'>) {
  const { data, error } = await db
    .from('lobbies')
    .insert(row)
    .select(LOBBY_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/* ------------------------- snapshots de bracket ------------------------ */

export async function listSnapshots(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  limit: number
) {
  const { data, error } = await db
    .from('bracket_snapshots')
    .select(
      `id, stage_id, taken_at, taken_by_staff_id, reason, match_count,
       staff:staff!bracket_snapshots_taken_by_staff_id_fkey(id, display_name, role)`
    )
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .order('taken_at', { ascending: false })
    .limit(limit);
  return { rows: data, error };
}

export async function findSnapshot(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  snapshotId: number
) {
  const { data } = await db
    .from('bracket_snapshots')
    .select('id, stage_id, taken_at, reason, match_count')
    .eq('id', snapshotId)
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/* ---------------------- overrides de départage ------------------------- */

export async function listOverrides(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('stage_tiebreaker_overrides')
    .select(
      `id, winner_team_id, loser_team_id, reason, set_by_staff_id, set_at,
       winner:teams!stage_tiebreaker_overrides_winner_team_id_fkey(id, name),
       loser:teams!stage_tiebreaker_overrides_loser_team_id_fkey(id, name)`
    )
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .order('set_at', { ascending: false });
  return { rows: data, error };
}

export async function insertOverride(
  db: AdminDb,
  row: TablesInsert<'stage_tiebreaker_overrides'>
) {
  const { data, error } = await db
    .from('stage_tiebreaker_overrides')
    .insert(row)
    .select(TIEBREAKER_OVERRIDE_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function findOverride(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  id: number
) {
  const { data } = await db
    .from('stage_tiebreaker_overrides')
    .select('id, winner_team_id, loser_team_id')
    .eq('id', id)
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function deleteOverride(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  id: number
) {
  const { error } = await db
    .from('stage_tiebreaker_overrides')
    .delete()
    .eq('id', id)
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId);
  return { error };
}
