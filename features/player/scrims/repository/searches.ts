// features/player/scrims/repository/searches.ts — `scrim_searches` (R5),
// toujours scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { ScrimSearchDto } from '../schemas';

/** Colonnes explicites (P4) : sans `tenant_id` ni `created_by`. */
const SEARCH_COLUMNS =
  'id, team_id, slots, format, note, status, expires_at, created_at, updated_at';

export type ScrimSearchWrite = {
  tenant_id: string;
  team_id: string;
  created_by: string;
  slots: string[];
  format: string | null;
  note: string | null;
  status: 'active';
  expires_at: string;
};

export async function readActiveSearch(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('scrim_searches')
    .select(SEARCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('status', 'active')
    .maybeSingle();
  return { search: data as unknown as ScrimSearchDto | null, error };
}

export async function cancelActiveSearch(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { error } = await db
    .from('scrim_searches')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('status', 'active');
  return { error };
}

export async function readActiveSearchId(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data } = await db
    .from('scrim_searches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function updateSearch(
  db: AdminDb,
  id: string,
  payload: ScrimSearchWrite
) {
  const { data, error } = await db
    .from('scrim_searches')
    .update(payload as never)
    .eq('id', id)
    .select(SEARCH_COLUMNS)
    .maybeSingle();
  return { search: data as unknown as ScrimSearchDto | null, error };
}

export async function insertSearch(db: AdminDb, payload: ScrimSearchWrite) {
  const { data, error } = await db
    .from('scrim_searches')
    .insert(payload as never)
    .select(SEARCH_COLUMNS)
    .maybeSingle();
  return { search: data as unknown as ScrimSearchDto | null, error };
}

/** Recherches actives des AUTRES équipes du tenant (alerte d'adversaire). */
export async function listOtherActiveSearches(
  db: AdminDb,
  tenantId: string,
  selfTeamId: string
) {
  const { data, error } = await db
    .from('scrim_searches')
    .select('team_id, slots, status, expires_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .neq('team_id', selfTeamId);
  return {
    rows: (data ?? []) as unknown as Array<{
      team_id: string;
      slots: string[] | null;
      status: string;
      expires_at: string;
    }>,
    error,
  };
}
