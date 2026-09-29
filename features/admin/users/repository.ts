// features/admin/users/repository.ts

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

export type UserSearchRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_id: string | null;
  team_name: string | null;
};

/**
 * Une seule fonction Postgres résout la recherche (email/display_name via
 * auth.users + battle_tag/username via team_members/profiles + jointure
 * équipe) — elle remplace 5+ requêtes et une boucle N+1 getUserById.
 */
export async function searchUsers(db: AdminDb, query: string) {
  const { data, error } = await db.rpc('admin_search_users', {
    p_query: query,
  });
  // Cast CONSERVÉ : le générateur type toute colonne d'un `RETURNS TABLE`
  // comme non nulle ; `UserSearchRow` dit la vérité (nullable).
  return { rows: (data as UserSearchRow[] | null) ?? [], error };
}

/* ---------------------------------------------------------------------------
 * Comptes, fiches staff, rosters (vague serveur 2). Les tables `staff` et
 * `tenant_staff` sont de portée PLATEFORME (pas de tenant_id) ; les écritures
 * de roster restent scopées par tenant.
 * ------------------------------------------------------------------------ */

type StaffInsert = Database['public']['Tables']['staff']['Insert'];
type StaffUpdate = Database['public']['Tables']['staff']['Update'];

export async function getAuthUser(db: AdminDb, userId: string) {
  return db.auth.admin.getUserById(userId);
}

export async function findStaffRole(db: AdminDb, userId: string) {
  const { data } = await db
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return data ?? null;
}

/** Nombre d'owners (garde « dernier owner »). */
export async function countOwners(db: AdminDb) {
  const { count, error } = await db
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner');
  return { count: count ?? 0, error };
}

export async function insertStaff(db: AdminDb, row: StaffInsert) {
  const { error } = await db.from('staff').insert(row);
  return { error };
}

export async function updateStaffByUser(
  db: AdminDb,
  userId: string,
  patch: StaffUpdate
) {
  const { error } = await db
    .from('staff')
    .update(patch)
    .eq('auth_user_id', userId);
  return { error };
}

export async function deleteStaffByUser(db: AdminDb, userId: string) {
  await db.from('staff').delete().eq('auth_user_id', userId);
}

export async function deleteAllMemberships(db: AdminDb, userId: string) {
  await db.from('team_members').delete().eq('user_id', userId);
}

/** Cible des permissions à l'unité (clé = compte auth). */
export async function findStaffPermissions(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('staff')
    .select('id, display_name, email, role, extra_permissions')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function setExtraPermissions(
  db: AdminDb,
  staffId: string,
  permissions: string[]
) {
  const { error } = await db
    .from('staff')
    .update({ extra_permissions: permissions })
    .eq('id', staffId);
  return { error };
}

export async function listUsersPage(
  db: AdminDb,
  args: {
    p_query: string | null;
    p_role: string | null;
    p_limit: number;
    p_offset: number;
    p_sort: string;
    p_dir: string;
    p_filters?: string[];
  }
) {
  // `p_filters` n'est envoyé que s'il y a quelque chose à filtrer (ancienne
  // signature 6-args tant que la migration de filtres n'est pas appliquée).
  const { data, error } = await db.rpc('admin_list_users', {
    ...args,
    p_query: args.p_query ?? undefined,
    p_role: args.p_role ?? undefined,
  });
  return { rows: data ?? [], error };
}

/** Enrichissements d'une page d'utilisateurs, en un seul aller-retour. */
export async function pageEnrichment(db: AdminDb, userIds: string[]) {
  const [discord, bnet, members] = await Promise.all([
    db
      .from('user_discord_links')
      .select('auth_user_id, discord_user_id, discord_username')
      .in('auth_user_id', userIds),
    db
      .from('user_battlenet_links')
      .select('auth_user_id, battle_tag')
      .in('auth_user_id', userIds),
    db
      .from('team_members')
      .select(
        'user_id, team_id, role, battle_tag, battle_tag_verified_at, verified_battle_net_id, team:teams ( id, name )'
      )
      .in('user_id', userIds),
  ]);
  return {
    discordLinks: discord.data ?? [],
    bnetLinks: bnet.data ?? [],
    teamMembers: members.error ? null : (members.data ?? []),
  };
}

export async function findMembershipForTag(
  db: AdminDb,
  userId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select(
      'id, tenant_id, battle_tag, battle_tag_verified_at, verified_battle_net_id'
    )
    .eq('user_id', userId)
    .eq('team_id', teamId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateMembershipById(
  db: AdminDb,
  id: string,
  patch: {
    battle_tag: string | null;
    battle_tag_verified_at?: null;
    verified_battle_net_id?: null;
  }
) {
  const { error } = await db.from('team_members').update(patch).eq('id', id);
  return { error };
}

export async function readMembershipVerification(db: AdminDb, id: string) {
  const { data } = await db
    .from('team_members')
    .select('battle_tag_verified_at, verified_battle_net_id')
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

export async function findLinkedBattleTag(db: AdminDb, userId: string) {
  const { data } = await db
    .from('user_battlenet_links')
    .select('battle_tag')
    .eq('auth_user_id', userId)
    .limit(1);
  return data?.[0]?.battle_tag ?? null;
}

/* --- Équipes du tenant (vue joueuse, actions staff) --- */

export async function findTeam(db: AdminDb, tenantId: string, teamId: string) {
  const { data } = await db
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data ?? null;
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

/** Libère le capitanat de `teamId` si `userId` le tenait. */
export async function vacateCaptaincy(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string
) {
  await db
    .from('teams')
    .update({ captain_id: null })
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .eq('captain_id', userId);
}
