// features/admin/staff-planning/repository.ts — accès base du planning du
// staff (`staff_planning_slots`), scopé par tenant (paramètre OBLIGATOIRE).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type SlotInsert =
  Database['public']['Tables']['staff_planning_slots']['Insert'];

export const SLOT_COLUMNS =
  'id, person_name, slot_date, start_time, end_time, role, note, source, created_at' as const;

export async function listSlots(
  db: AdminDb,
  tenantId: string,
  from: string,
  to: string
) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .select(SLOT_COLUMNS)
    .eq('tenant_id', tenantId)
    .gte('slot_date', from)
    .lte('slot_date', to)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });
  return { rows: data ?? [], error };
}

/** Pseudos déjà connus (légende, suggestions), toutes dates confondues. */
export async function listPeople(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .select('person_name')
    .eq('tenant_id', tenantId)
    .limit(5000);
  return { rows: data ?? [], error };
}

export async function insertSlot(db: AdminDb, row: SlotInsert) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .insert(row)
    .select(SLOT_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deleteSlot(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id');
  return { deleted: data?.length ?? 0, error };
}

/** Retire l'import précédent (source `csv`) d'un mois — jamais les saisies manuelles. */
export async function deleteCsvSlotsOfMonth(
  db: AdminDb,
  tenantId: string,
  first: string,
  last: string
) {
  const { error } = await db
    .from('staff_planning_slots')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source', 'csv')
    .gte('slot_date', first)
    .lte('slot_date', last);
  return { error };
}

/** Insertion en lot ; un doublon d'une saisie manuelle est ignoré. */
export async function insertCsvSlots(db: AdminDb, rows: SlotInsert[]) {
  if (rows.length === 0) return { inserted: 0, error: null };
  const { data, error } = await db
    .from('staff_planning_slots')
    .upsert(rows, {
      onConflict: 'tenant_id,person_name,slot_date,start_time',
      ignoreDuplicates: true,
    })
    .select('id');
  return { inserted: data?.length ?? 0, error };
}
