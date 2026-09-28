// features/admin/users/repository.ts

import type { SupabaseClient } from '@supabase/supabase-js';

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
export async function searchUsers(db: SupabaseClient, query: string) {
  const { data, error } = await db.rpc('admin_search_users', {
    p_query: query,
  });
  return { rows: (data as UserSearchRow[] | null) ?? [], error };
}
