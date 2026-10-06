// features/admin/staff-planning/repository.ts — accès base du planning du
// staff (`staff_planning_slots`), scopé par tenant (paramètre OBLIGATOIRE).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type SlotInsert =
  Database['public']['Tables']['staff_planning_slots']['Insert'];
type SlotUpdate =
  Database['public']['Tables']['staff_planning_slots']['Update'];

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

/** Jours ayant au moins un créneau (couverture des soirs de match). */
export async function listSlotDates(
  db: AdminDb,
  tenantId: string,
  from: string,
  to: string
) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .select('slot_date')
    .eq('tenant_id', tenantId)
    .gte('slot_date', from)
    .lte('slot_date', to)
    .limit(5000);
  return { rows: data ?? [], error };
}

/** Pseudo d'un créneau du tenant : contrôle « Mes dispos ». */
export async function getSlotOwner(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .select('id, person_name')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** `onlyPerson` : n'écrit le créneau que s'il porte (encore) ce pseudo. */
export async function updateSlot(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: SlotUpdate,
  onlyPerson?: string
) {
  let q = db
    .from('staff_planning_slots')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (onlyPerson !== undefined) q = q.eq('person_name', onlyPerson);
  const { data, error } = await q.select(SLOT_COLUMNS).maybeSingle();
  return { row: data ?? null, error };
}

/**
 * Matchs programmés d'une fenêtre (instants ISO), annulés exclus : l'agenda
 * les regroupe par soir pour montrer quels soirs il faut couvrir.
 */
export async function listMatchTimes(
  db: AdminDb,
  tenantId: string,
  fromIso: string,
  toIso: string
) {
  const { data, error } = await db
    .from('matches')
    .select('scheduled_at, status')
    .eq('tenant_id', tenantId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', fromIso)
    .lt('scheduled_at', toIso)
    .limit(2000);
  return { rows: data ?? [], error };
}

/** Créneaux importés (`csv`) d'une fenêtre : base du rapprochement d'import. */
export async function listCsvSlots(
  db: AdminDb,
  tenantId: string,
  first: string,
  last: string
) {
  const { data, error } = await db
    .from('staff_planning_slots')
    .select('id, person_name, slot_date, start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('source', 'csv')
    .gte('slot_date', first)
    .lte('slot_date', last);
  return { rows: data ?? [], error };
}

export async function deleteSlotsByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  if (ids.length === 0) return { error: null };
  const { error } = await db
    .from('staff_planning_slots')
    .delete()
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { error };
}

export async function deleteSlot(
  db: AdminDb,
  tenantId: string,
  id: string,
  onlyPerson?: string
) {
  let q = db
    .from('staff_planning_slots')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (onlyPerson !== undefined) q = q.eq('person_name', onlyPerson);
  const { data, error } = await q.select('id');
  return { deleted: data?.length ?? 0, error };
}

/** Insertion en lot ; un doublon d'un créneau existant est ignoré. */
export async function insertSlotsIgnoringDuplicates(
  db: AdminDb,
  rows: SlotInsert[]
) {
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
