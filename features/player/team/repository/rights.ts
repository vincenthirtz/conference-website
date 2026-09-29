// features/player/team/repository/rights.ts — délégations de droits (J3) :
// `team_member_permissions` (aussi journal : « qui a donné quoi »), roster et
// capitanat de l'équipe. Toujours scopé tenant + équipe.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type GrantRow = {
  user_id: string;
  permission: string;
  granted_by: string | null;
  created_at: string;
  revoked_at: string | null;
};

export async function listGrants(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_member_permissions')
    .select('user_id, permission, granted_by, created_at, revoked_at')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(200);
  return { grants: (data ?? []) as GrantRow[], error };
}

export async function listMemberRoles(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);
  return {
    members: (data ?? []) as { user_id: string | null; role: string | null }[],
    error,
  };
}

/** Capitaine en poste — la ligne qui a TOUT par définition du rôle. */
export async function readCaptainId(
  db: AdminDb,
  tenantId: string,
  teamId: string
): Promise<string | null> {
  const { data } = await db
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as { captain_id?: string | null } | null)?.captain_id ?? null;
}

export async function isTeamMember(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return { member: !!data, error };
}

export async function hasActiveGrant(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string,
  permission: string
): Promise<boolean> {
  const { data } = await db
    .from('team_member_permissions')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('permission', permission)
    .is('revoked_at', null)
    .maybeSingle();
  return !!data;
}

export async function insertGrant(
  db: AdminDb,
  row: {
    tenant_id: string;
    team_id: string;
    user_id: string;
    permission: string;
    granted_by: string;
  }
) {
  const { error } = await db.from('team_member_permissions').insert(row);
  return { error };
}

export async function revokeGrant(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string,
  permission: string,
  revokedBy: string
) {
  const { error } = await db
    .from('team_member_permissions')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .eq('permission', permission)
    .is('revoked_at', null);
  return { error };
}
