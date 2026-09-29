// features/admin/custom-game-presets/repository.ts — accès base des presets
// (`custom_game_presets`), scopé par tenant (paramètre OBLIGATOIRE).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type PresetInsert =
  Database['public']['Tables']['custom_game_presets']['Insert'];
type PresetUpdate =
  Database['public']['Tables']['custom_game_presets']['Update'];

/** Ligne complète rendue à l'écran (`{ preset }`, `{ presets }`). */
export const PRESET_COLUMNS =
  'id, tenant_id, game, tournament_id, stage_id, name, import_code, description, map_pool, enabled, created_by, created_at, updated_at' as const;

export async function listPresets(db: AdminDb, tenantId: string, game: string) {
  const { data, error } = await db
    .from('custom_game_presets')
    .select(PRESET_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('game', game);
  return { rows: data ?? [], error };
}

/** Périmètres occupés d'un jeu (un seul preset par périmètre). */
export async function listPresetScopes(
  db: AdminDb,
  tenantId: string,
  game: string
) {
  const { data, error } = await db
    .from('custom_game_presets')
    .select('id, tournament_id, stage_id')
    .eq('tenant_id', tenantId)
    .eq('game', game);
  return { rows: data ?? [], error };
}

export async function findPreset(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('custom_game_presets')
    .select(PRESET_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function findTournament(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function findStage(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function insertPreset(db: AdminDb, row: PresetInsert) {
  const { data, error } = await db
    .from('custom_game_presets')
    .insert(row)
    .select(PRESET_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function updatePreset(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: PresetUpdate
) {
  const { data, error } = await db
    .from('custom_game_presets')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(PRESET_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deletePreset(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('custom_game_presets')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
