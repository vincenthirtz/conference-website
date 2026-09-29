// features/admin/teams/repository/roster.ts — roster d'une équipe
// (`team_members`) et dérogation de verrou par inscription
// (`tournament_teams.roster_unlocked_until`).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { ROSTER_BULK_MEMBER_COLUMNS } from '../schemas';

/* ------------------------- verrou de roster ---------------------------- */

export async function listTeamRegistrationWindows(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('tournament_teams')
    .select('tournament_id, roster_unlocked_until')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { rows: data ?? [], error };
}

export async function listTournamentLocks(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('tournaments')
    .select('id, name, status, roster_locked_at, roster_unlocked_until')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { rows: data ?? [], error };
}

export async function setTeamRegistrationWindow(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  tournamentId: string,
  until: string | null
) {
  const { error } = await db
    .from('tournament_teams')
    .update({ roster_unlocked_until: until })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('tournament_id', tournamentId);
  return { error };
}

/* --------------------------- roster en masse --------------------------- */

/**
 * Membres ciblés, bornés à l'équipe. Sans filtre `tenant_id` (requête
 * d'origine) : l'équipe a été vérifiée dans l'espace juste avant.
 */
export async function listTeamMembersByIds(
  db: AdminDb,
  teamId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('team_members')
    .select(ROSTER_BULK_MEMBER_COLUMNS)
    .eq('team_id', teamId)
    .in('id', ids);
  return { rows: data ?? [], error };
}

export async function updateTeamMember(
  db: AdminDb,
  teamId: string,
  memberId: string,
  patch: TablesUpdate<'team_members'>
) {
  const { error } = await db
    .from('team_members')
    .update(patch)
    .eq('id', memberId)
    .eq('team_id', teamId);
  return { error };
}

export async function deleteTeamMember(
  db: AdminDb,
  teamId: string,
  memberId: string
) {
  const { error } = await db
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId);
  return { error };
}
