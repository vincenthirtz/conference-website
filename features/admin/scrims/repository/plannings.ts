// features/admin/scrims/repository/plannings.ts — accès base des grilles de
// dispos « When2Meet » (`scrim_plannings`, `scrim_planning_availabilities`)
// et du scrim qu'une validation matérialise. `tenantId` obligatoire partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  AVAILABILITY_ROW_COLUMNS,
  PLANNING_ROW_COLUMNS,
  PLANNING_WITH_TEAMS_COLUMNS,
  SCRIM_ROW_COLUMNS,
} from '../schemas';

export type PlanningListFilters = {
  status: string | null;
  teamId: string | null;
  search: string | null;
  offset: number;
  limit: number;
};

export async function listPlannings(
  db: AdminDb,
  tenantId: string,
  f: PlanningListFilters
) {
  // Équipes embarquées : sans elles, chaque écran rappelait
  // /api/admin/teams?limit=200 uniquement pour traduire des ids en noms.
  let query = db
    .from('scrim_plannings')
    .select(PLANNING_WITH_TEAMS_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (f.status) query = query.eq('status', f.status);
  if (f.teamId) {
    query = query.or(`team1_id.eq.${f.teamId},team2_id.eq.${f.teamId}`);
  }
  if (f.search) query = query.ilike('title', `%${f.search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);
  return { rows: data ?? [], count, error };
}

export async function insertPlanning(
  db: AdminDb,
  row: TablesInsert<'scrim_plannings'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .insert(row)
    .select(PLANNING_ROW_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** Grille + équipes (fiche staff), hors corbeille. */
export async function getPlanningWithTeams(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select(PLANNING_WITH_TEAMS_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** Ligne complète, hors corbeille. */
export async function getPlanning(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select(PLANNING_ROW_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** Les deux équipes d'une grille (aperçu des conflits). */
export async function getPlanningTeams(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .select('team1_id, team2_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updatePlanning(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'scrim_plannings'>
) {
  const { data, error } = await db
    .from('scrim_plannings')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(PLANNING_ROW_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function softDeletePlanning(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const now = new Date().toISOString();
  const { error } = await db
    .from('scrim_plannings')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function listAvailabilities(
  db: AdminDb,
  tenantId: string,
  planningId: string
) {
  const { data, error } = await db
    .from('scrim_planning_availabilities')
    .select(AVAILABILITY_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('planning_id', planningId);
  return { rows: data ?? [], error };
}

export async function getMyAvailabilitySlots(
  db: AdminDb,
  tenantId: string,
  planningId: string,
  userId: string
) {
  const { data } = await db
    .from('scrim_planning_availabilities')
    .select('slots')
    .eq('tenant_id', tenantId)
    .eq('planning_id', planningId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.slots ?? null;
}

export async function upsertStaffAvailability(
  db: AdminDb,
  row: {
    tenant_id: string;
    planning_id: string;
    user_id: string;
    display_name: string | null;
    slots: string[];
  }
) {
  const { error } = await db.from('scrim_planning_availabilities').upsert(
    {
      tenant_id: row.tenant_id,
      planning_id: row.planning_id,
      party: 'staff',
      user_id: row.user_id,
      display_name: row.display_name,
      slots: row.slots,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'planning_id,user_id' }
  );
  return { error };
}

/* ---- Scrim matérialisé par la validation d'un créneau ---- */

export async function findScrimBySourcePlanning(
  db: AdminDb,
  tenantId: string,
  planningId: string
) {
  const { data } = await db
    .from('scrims')
    .select(SCRIM_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('source_planning_id', planningId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Noms des deux équipes. Lecture NON scopée par tenant, comme la route
 * d'origine : les ids viennent d'une grille déjà scopée.
 */
export async function listTeamNamesByIds(db: AdminDb, ids: string[]) {
  const { data } = await db.from('teams').select('id, name').in('id', ids);
  return data ?? [];
}

export async function insertScrimFromPlanning(
  db: AdminDb,
  row: TablesInsert<'scrims'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('scrims')
    .insert(row)
    .select(SCRIM_ROW_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function rescheduleScrimFromPlanning(
  db: AdminDb,
  tenantId: string,
  scrimId: string,
  patch: TablesUpdate<'scrims'>
) {
  const { data, error } = await db
    .from('scrims')
    .update(patch)
    .eq('id', scrimId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select(SCRIM_ROW_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}
