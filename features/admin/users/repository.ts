// features/admin/users/repository.ts

import type { AdminDb } from '@/utils/admin/serviceContext';

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
