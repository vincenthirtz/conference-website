// features/admin/adherents/repository.ts — table `adherents`, donnée
// d'ASSOCIATION : non scopée par tenant (garde `scope: 'platform'`).

import type { AdminDb } from '../../../utils/admin/serviceContext';
import type { Database } from '../../../types/database.generated';
import { listRange, searchOrFilter } from '../../../utils/admin/listQuery';
import { ADHERENT_LIST_COLUMNS, type AdherentListQuery } from './schemas';

type AdherentInsert = Database['public']['Tables']['adherents']['Insert'];

const SEARCH_COLUMNS = [
  'last_name',
  'first_name',
  'email',
  'member_number',
] as const;

export async function listAdherents(db: AdminDb, q: AdherentListQuery) {
  let query = db
    .from('adherents')
    .select(ADHERENT_LIST_COLUMNS, { count: 'exact' });
  if (q.q) query = query.or(searchOrFilter(q.q, SEARCH_COLUMNS));
  if (q.paymentStatus) query = query.eq('payment_status', q.paymentStatus);
  if (q.year !== undefined) query = query.eq('current_year', q.year);
  if (q.role) query = query.eq('role', q.role);
  if (q.active) query = query.eq('is_active', q.active === 'true');
  query = q.sort
    ? query.order(q.sort, { ascending: q.dir === 'asc' })
    : query
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true });
  const [from, to] = listRange(q);
  const { data, error, count } = await query.range(from, to);
  return { rows: data ?? [], total: count ?? 0, error };
}

/** Compteurs du bandeau : requêtes `head` légères, sans lecture de lignes. */
export async function countActiveAdherents(
  db: AdminDb,
  where: { currentYear?: number; paymentStatus?: string } = {}
): Promise<number> {
  let query = db
    .from('adherents')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (where.currentYear !== undefined)
    query = query.eq('current_year', where.currentYear);
  if (where.paymentStatus)
    query = query.eq('payment_status', where.paymentStatus);
  const { count } = await query;
  return count ?? 0;
}

export async function findAdherentByEmail(db: AdminDb, email: string) {
  const { data } = await db
    .from('adherents')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  return data ?? null;
}

export async function insertAdherent(db: AdminDb, row: AdherentInsert) {
  const { data, error } = await db
    .from('adherents')
    .insert(row)
    .select()
    .single();
  return { row: data ?? null, error };
}
