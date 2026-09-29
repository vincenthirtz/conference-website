// features/admin/pole-members/repository.ts — membres des pôles.
//
// Exception documentée à la règle « tenantId obligatoire » :
// `association_pole_members` n'a PAS de colonne tenant_id (donnée de
// l'association, une seule page /association).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { POLE_MEMBER_COLUMNS } from './schemas';

type PoleMemberInsert =
  Database['public']['Tables']['association_pole_members']['Insert'];
type PoleMemberUpdate =
  Database['public']['Tables']['association_pole_members']['Update'];

export async function listPoleMembers(
  db: AdminDb,
  opts: { limit: number; includeInactive: boolean; poleKey?: string }
) {
  let query = db
    .from('association_pole_members')
    .select(POLE_MEMBER_COLUMNS)
    .order('pole_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(opts.limit);
  if (!opts.includeInactive) query = query.eq('is_active', true);
  if (opts.poleKey) query = query.eq('pole_key', opts.poleKey);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

/** Plus grand `sort_order` du pôle (pour placer un nouveau membre en fin). */
export async function maxSortOrder(db: AdminDb, poleKey: string) {
  const { data } = await db
    .from('association_pole_members')
    .select('sort_order')
    .eq('pole_key', poleKey)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.sort_order ?? 0;
}

export async function insertPoleMember(db: AdminDb, payload: PoleMemberInsert) {
  const { data, error } = await db
    .from('association_pole_members')
    .insert(payload)
    .select(POLE_MEMBER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function findPoleMember(db: AdminDb, id: string) {
  const { data, error } = await db
    .from('association_pole_members')
    .select(POLE_MEMBER_COLUMNS)
    .eq('id', id)
    .single();
  return { row: data ?? null, error };
}

export async function updatePoleMember(
  db: AdminDb,
  id: string,
  payload: PoleMemberUpdate
) {
  const { data, error } = await db
    .from('association_pole_members')
    .update(payload)
    .eq('id', id)
    .select(POLE_MEMBER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deletePoleMember(db: AdminDb, id: string) {
  const { error } = await db
    .from('association_pole_members')
    .delete()
    .eq('id', id);
  return { error };
}
