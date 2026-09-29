// features/admin/matches/repository/lineup.ts — feuille de match côté
// organisation (`match_lineups`, `match_participants`).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';

export async function getMatchForLineup(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('matches')
    .select(
      'id, tournament_id, status, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at, scheduled_at'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

/**
 * En-têtes, participants et noms d'équipes : tous lus sous le tenant du
 * staff (défense en profondeur : le match est déjà scopé).
 */
export async function readLineupSheets(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  teamIds: string[]
) {
  const [{ data: headers }, { data: picked }, { data: teams }] =
    await Promise.all([
      db
        .from('match_lineups')
        .select('team_id, status, validated_at, validated_by_kind')
        .eq('tenant_id', tenantId)
        .eq('match_id', matchId),
      db
        .from('match_participants')
        .select('team_id, user_id, battle_tag, role, is_substitute')
        .eq('tenant_id', tenantId)
        .eq('match_id', matchId),
      db
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in(
          'id',
          teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']
        ),
    ]);
  return { headers: headers ?? [], picked: picked ?? [], teams: teams ?? [] };
}

export async function reopenLineup(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  teamId: string
) {
  const { error } = await db
    .from('match_lineups')
    .update({
      status: 'draft',
      validated_by: null,
      validated_by_kind: null,
      validated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .eq('team_id', teamId);
  return { error };
}

export async function listTeamRoster(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data } = await db
    .from('team_members')
    .select('user_id, role, battle_tag, is_substitute')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return data ?? [];
}

export async function listPickedUserIds(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  teamId: string
) {
  const { data } = await db
    .from('match_participants')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .eq('team_id', teamId);
  return data ?? [];
}

export async function replaceParticipants(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  teamId: string,
  rows: TablesInsert<'match_participants'>[]
) {
  await db
    .from('match_participants')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .eq('team_id', teamId);
  const { error } = await db.from('match_participants').insert(rows);
  return { error };
}

export async function upsertLineupHeader(
  db: AdminDb,
  row: TablesInsert<'match_lineups'>
) {
  const { error } = await db
    .from('match_lineups')
    .upsert(row, { onConflict: 'match_id,team_id' });
  return { error };
}
