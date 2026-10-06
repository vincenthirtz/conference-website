// features/player/profile/repository.ts — accès base du profil de la joueuse
// (lot P9) : métadonnées du compte (Supabase Auth), fiches de roster, rôle
// staff. La base est REÇUE (`ctx.db`), jamais importée.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Remplace les métadonnées du compte (déjà fusionnées par le service). */
export async function writeUserMetadata(
  db: AdminDb,
  userId: string,
  userMetadata: Record<string, unknown>
) {
  const { error } = await db.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata,
  });
  return { error };
}

/**
 * Propage BattleTag / SR / poste / Twitch sur les fiches de roster de la
 * joueuse, dans le tenant courant. Rend l'erreur, ne lève pas.
 */
export async function updateRosterEntries(
  db: AdminDb,
  tenantId: string,
  userId: string,
  updates: Record<string, unknown>
) {
  const { error } = await db
    .from('team_members')
    .update(updates as never)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  return { error };
}

/**
 * Rôle staff de l'appelante, tous tenants (même lecture qu'avant : une ligne
 * `owner` bloque l'auto-suppression).
 */
export async function readStaffRole(
  db: AdminDb,
  userId: string
): Promise<string | null> {
  const { data } = await db
    .from('staff')
    .select('role')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return (data as { role?: string | null } | null)?.role ?? null;
}

export type CaptainedTeam = { id: string; name: string | null };

/**
 * Équipes NON dissoutes dont l'appelante est capitaine ET qui comptent au
 * moins un autre membre, tous tenants. La FK `teams_captain_fk` est en
 * ON DELETE SET NULL : supprimer ce compte laisserait ces équipes sans
 * capitaine. Une équipe où elle est seule n'est pas bloquante (même règle que
 * `leaveTeam`). Rend l'erreur, ne lève pas.
 */
export async function readCaptainedTeamsWithOthers(
  db: AdminDb,
  userId: string
): Promise<{ teams: CaptainedTeam[]; error: unknown }> {
  const { data: teamRows, error } = await db
    .from('teams')
    .select('id, name')
    .eq('captain_id', userId)
    .is('deleted_at', null);
  if (error) return { teams: [], error };
  const teams = (teamRows ?? []) as CaptainedTeam[];
  if (teams.length === 0) return { teams: [], error: null };

  const { data: memberRows, error: membersErr } = await db
    .from('team_members')
    .select('team_id, user_id')
    .in(
      'team_id',
      teams.map((t) => t.id)
    );
  if (membersErr) return { teams: [], error: membersErr };
  const members = (memberRows ?? []) as {
    team_id: string;
    user_id: string | null;
  }[];
  return {
    teams: teams
      .filter((t) =>
        members.some((m) => m.team_id === t.id && m.user_id !== userId)
      )
      .map((t) => ({ id: t.id, name: t.name ?? null })),
    error: null,
  };
}

/** Supprime le compte Supabase Auth. */
export async function deleteAuthUser(db: AdminDb, userId: string) {
  const { error } = await db.auth.admin.deleteUser(userId);
  return { error };
}
