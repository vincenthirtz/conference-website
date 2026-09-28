// features/admin/free-players/repository.ts — accès base, scopé par tenant.
//
// `tenantId` est un paramètre OBLIGATOIRE de chaque fonction : une requête
// non scopée ne peut pas s'écrire par accident.

import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_PLAYER_SELECT, type FreePlayerRow } from '@/utils/freePlayers';

export type FreePlayerRemovalRow = Pick<
  FreePlayerRow,
  'id' | 'source' | 'display_name' | 'discord_username'
>;

export async function listByTenant(db: SupabaseClient, tenantId: string) {
  const { data, error } = await db
    .from('free_players')
    .select(FREE_PLAYER_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false });
  return { rows: (data ?? []) as FreePlayerRow[], error };
}

export async function findForRemoval(
  db: SupabaseClient,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('free_players')
    .select('id, source, display_name, discord_username')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: (data ?? null) as FreePlayerRemovalRow | null, error };
}

export async function deleteById(
  db: SupabaseClient,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('free_players')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
