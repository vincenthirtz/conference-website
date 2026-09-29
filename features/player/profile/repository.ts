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

/** Supprime le compte Supabase Auth. */
export async function deleteAuthUser(db: AdminDb, userId: string) {
  const { error } = await db.auth.admin.deleteUser(userId);
  return { error };
}
