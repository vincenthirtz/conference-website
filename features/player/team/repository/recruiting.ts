// features/player/team/repository/recruiting.ts — viviers de recrutement de
// l'équipe gérée (lot P10) : recherche dans les rosters du tenant, joueuses
// libres. Toujours scopé tenant ; aucune énumération de `auth.users`.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { FREE_PLAYER_SELECT, type FreePlayerRow } from '@/utils/freePlayers';

/** Sous-chaîne BattleTag / pseudo dans les rosters DU TENANT (≤ 20). */
export async function searchRosterByText(
  db: AdminDb,
  tenantId: string,
  safeQuery: string
) {
  const { data } = await db
    .from('team_members')
    .select('user_id, battle_tag, display_name, team_id')
    .eq('tenant_id', tenantId)
    .or(`battle_tag.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
    .limit(20);
  return (data ?? []) as {
    user_id: string | null;
    battle_tag: string | null;
    display_name: string | null;
  }[];
}

/** RPC de recherche de comptes (LIKE côté SQL — le service ne garde que l'égalité). */
export async function searchUsersRpc(db: AdminDb, query: string) {
  const { data, error } = await db.rpc('admin_search_users', {
    p_query: query,
  });
  return {
    rows: (data ?? []) as {
      id?: string;
      email?: string | null;
      display_name?: string | null;
      battle_tag?: string | null;
    }[],
    error,
  };
}

/** Appartenances (tenant) d'une liste de comptes. */
export async function listRosterRowsForUsers(
  db: AdminDb,
  tenantId: string,
  userIds: string[]
) {
  const { data } = await db
    .from('team_members')
    .select('user_id, battle_tag')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);
  return (data ?? []) as {
    user_id: string | null;
    battle_tag: string | null;
  }[];
}

export async function listTenantFreePlayers(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('free_players')
    .select(FREE_PLAYER_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false });
  return { rows: (data ?? []) as unknown as FreePlayerRow[], error };
}

/** Comptes déjà membres d'une équipe du tenant. */
export async function listTenantRosterUserIds(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('team_members')
    .select('user_id')
    .eq('tenant_id', tenantId);
  const ids = new Set(
    (data ?? [])
      .map((r) => (r as Record<string, unknown>).user_id)
      .filter((v): v is string => typeof v === 'string')
  );
  return { ids, error };
}

/** Joueuse libre LIÉE à ce compte, dans ce tenant. */
export async function readLinkedFreePlayer(
  db: AdminDb,
  tenantId: string,
  authUserId: string
) {
  const { data, error } = await db
    .from('free_players')
    .select('discord_user_id, discord_username, auth_user_id')
    .eq('tenant_id', tenantId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return {
    freePlayer: data as {
      discord_user_id: string | null;
      discord_username: string | null;
    } | null,
    error,
  };
}

export async function teamInTenant(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { exists: !!data, error };
}
