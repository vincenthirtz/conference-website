// features/player/team/repository/roster.ts — roster d'une équipe : lignes
// `team_members`, en-tête `teams`, RPC de capitanat (lot P10). Toujours scopé
// tenant + équipe, colonnes explicites.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** En-tête d'équipe lu par les gestes de roster. */
export type TeamHeadRow = {
  id: string;
  name: string;
  captain_id: string | null;
  logo_url: string | null;
};

export async function readTeamHead(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, name, captain_id, logo_url')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { team: (data as TeamHeadRow | null) ?? null, error };
}

/** Équipe dont `userId` est la capitaine en poste (capitanat voulu, S4). */
export async function findCaptainTeam(
  db: AdminDb,
  tenantId: string,
  userId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, captain_id')
    .eq('captain_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    team: data as { id: string; captain_id: string | null } | null,
    error,
  };
}

export type RosterMemberRow = {
  id: string;
  user_id: string;
  role: string;
  battle_tag: string | null;
  is_substitute: boolean;
  skill_rating: number | null;
};

/** Une ligne du roster, seulement si elle appartient à CETTE équipe. */
export async function readRosterMember(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  memberId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('id, user_id, role, battle_tag, is_substitute, skill_rating')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { member: (data as RosterMemberRow | null) ?? null, error };
}

export async function updateRosterMember(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  memberId: string,
  patch: Record<string, unknown>
) {
  const { error } = await db
    .from('team_members')
    .update(patch as never)
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function deleteRosterMember(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  memberId: string
) {
  const { error } = await db
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ------------------------------------------------------------------------
 * Départ (`leave`)
 * ---------------------------------------------------------------------- */

export type LeavingTeamRow = {
  captain_id: string | null;
  name: string | null;
  discord_role_id: string | null;
  discord_channel_id: string | null;
  discord_voice_channel_id: string | null;
};

export async function readLeavingTeam(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data } = await db
    .from('teams')
    .select(
      'captain_id, name, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as LeavingTeamRow | null) ?? null;
}

export async function countRoster(
  db: AdminDb,
  tenantId: string,
  teamId: string
): Promise<number | null> {
  const { count } = await db
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return count ?? null;
}

export async function deleteMembership(
  db: AdminDb,
  tenantId: string,
  membershipId: string
) {
  const { error } = await db
    .from('team_members')
    .delete()
    .eq('id', membershipId)
    .eq('tenant_id', tenantId);
  return { error };
}

/** Dissolution douce, cohérente avec le DELETE admin. */
export async function dissolveTeam(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  nowIso: string
) {
  const { error } = await db
    .from('teams')
    .update({ is_active: false, deleted_at: nowIso, updated_at: nowIso })
    .eq('id', teamId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ------------------------------------------------------------------------
 * Capitanat (RPC transactionnelles) et actualité automatique
 * ---------------------------------------------------------------------- */

export async function rpcTransferCaptain(
  db: AdminDb,
  args: { teamId: string; newCaptain: string; tenantId: string; actor: string }
) {
  const { error } = await db.rpc('transfer_captain', {
    p_team_id: args.teamId,
    p_new_captain: args.newCaptain,
    p_tenant: args.tenantId,
    p_actor: args.actor,
  });
  return { error };
}

export async function rpcReassignCaptain(
  db: AdminDb,
  args: { teamId: string; newCaptain: string; tenantId: string }
) {
  const { error } = await db.rpc('reassign_captain', {
    p_team_id: args.teamId,
    p_new_captain: args.newCaptain,
    p_tenant: args.tenantId,
  });
  return { error };
}

export type TeamNewsRow = {
  title: string;
  slug: string;
  tag: string;
  excerpt: string;
  content: string;
  image_url: string | null;
  team_id: string;
  status: 'draft' | 'published';
  published_at: string | null;
  tenant_id: string;
};

/** Actualité « X rejoint l'équipe » (effet de bord best-effort). */
export async function insertTeamNews(db: AdminDb, row: TeamNewsRow) {
  await db.from('news').insert(row as never);
}
