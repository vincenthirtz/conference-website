// features/admin/free-players/repository.ts — accès base, scopé par tenant.
//
// `tenantId` est un paramètre OBLIGATOIRE de chaque fonction : une requête
// non scopée ne peut pas s'écrire par accident.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { FREE_PLAYER_SELECT } from '@/utils/freePlayers';
import { ANNOUNCEMENT_SELECT } from '@/utils/freePlayers/announcement';

export async function listByTenant(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('free_players')
    .select(FREE_PLAYER_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function findForRemoval(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('free_players')
    .select(`${ANNOUNCEMENT_SELECT}, source, display_name, discord_username`)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteById(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('free_players')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
