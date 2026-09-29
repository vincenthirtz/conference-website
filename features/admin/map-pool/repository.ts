// features/admin/map-pool/repository.ts — accès base du catalogue de maps
// tenant-level (`tenant_map_pool`), scopé par tenant (paramètre OBLIGATOIRE).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type MapPoolInsert = Database['public']['Tables']['tenant_map_pool']['Insert'];
type MapPoolUpdate = Database['public']['Tables']['tenant_map_pool']['Update'];

/** Ligne complète rendue à l'écran (`{ map }`, `{ maps }`, `{ pools }`). */
export const MAP_POOL_COLUMNS =
  'id, tenant_id, game, map_name, map_type, image_url, enabled, order_index, created_at, updated_at' as const;

export async function listMaps(db: AdminDb, tenantId: string, game?: string) {
  let query = db
    .from('tenant_map_pool')
    .select(MAP_POOL_COLUMNS)
    .eq('tenant_id', tenantId);
  if (game !== undefined) query = query.eq('game', game);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

/** Noms + rangs d'un jeu : dédoublonnage et prochain `order_index`. */
export async function listMapNames(
  db: AdminDb,
  tenantId: string,
  game: string
) {
  const { data, error } = await db
    .from('tenant_map_pool')
    .select('id, map_name, order_index')
    .eq('tenant_id', tenantId)
    .eq('game', game);
  return { rows: data ?? [], error };
}

export async function insertMap(db: AdminDb, row: MapPoolInsert) {
  const { data, error } = await db
    .from('tenant_map_pool')
    .insert(row)
    .select(MAP_POOL_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function insertMaps(db: AdminDb, rows: MapPoolInsert[]) {
  const { data, error } = await db
    .from('tenant_map_pool')
    .insert(rows)
    .select(MAP_POOL_COLUMNS);
  return { rows: data ?? [], error };
}

export async function findMap(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tenant_map_pool')
    .select('id, game, map_name')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateMap(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: MapPoolUpdate
) {
  const { data, error } = await db
    .from('tenant_map_pool')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(MAP_POOL_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deleteMap(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('tenant_map_pool')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
