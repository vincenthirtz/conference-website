// features/admin/partners/repository.ts — partenaires et demandes de
// partenariat.
//
// Exception documentée à la règle « tenantId obligatoire » : `partners` et
// `partnership_requests` n'ont PAS de colonne tenant_id (données de
// l'association, cf. database/migrations/create_partners_tables.sql).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import {
  PARTNER_COLUMNS,
  PARTNER_LIST_COLUMNS,
  PARTNERSHIP_REQUEST_LIST_COLUMNS,
} from './schemas';

type PartnerInsert = Database['public']['Tables']['partners']['Insert'];
type PartnerUpdate = Database['public']['Tables']['partners']['Update'];

export type PartnerListOptions = {
  limit: number;
  offset: number;
  withTotal: boolean;
  category?: string;
  active?: boolean;
  search?: string;
  /** Colonne de tri (allowlist appliquée par le service) ; défaut historique sinon. */
  sort?: { column: string; ascending: boolean };
};

export async function listPartners(db: AdminDb, opts: PartnerListOptions) {
  let query = db.from('partners').select(PARTNER_LIST_COLUMNS, {
    count: opts.withTotal ? 'exact' : undefined,
  });
  if (opts.category) query = query.eq('category', opts.category);
  if (opts.active !== undefined) query = query.eq('is_active', opts.active);
  if (opts.search) query = query.ilike('name', `%${opts.search}%`);
  if (opts.sort) {
    query = query.order(opts.sort.column, { ascending: opts.sort.ascending });
  } else {
    query = query
      .order('category', { ascending: true })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
  }
  const { data, error, count } = await query.range(
    opts.offset,
    opts.offset + opts.limit - 1
  );
  return { rows: data ?? [], count, error };
}

export async function insertPartner(db: AdminDb, payload: PartnerInsert) {
  const { data, error } = await db
    .from('partners')
    .insert(payload)
    .select(PARTNER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function findPartner(db: AdminDb, id: string) {
  const { data, error } = await db
    .from('partners')
    .select(PARTNER_COLUMNS)
    .eq('id', id)
    .single();
  return { row: data ?? null, error };
}

export async function findPartnerName(db: AdminDb, id: string) {
  const { data } = await db
    .from('partners')
    .select('id, name')
    .eq('id', id)
    .single();
  return data ?? null;
}

export async function updatePartner(
  db: AdminDb,
  id: string,
  updates: PartnerUpdate
) {
  const { data, error } = await db
    .from('partners')
    .update(updates)
    .eq('id', id)
    .select(PARTNER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deletePartner(db: AdminDb, id: string) {
  const { error } = await db.from('partners').delete().eq('id', id);
  return { error };
}

/* ---- Demandes de partenariat ---- */

export async function listPartnershipRequests(
  db: AdminDb,
  opts: {
    limit: number;
    offset: number;
    withTotal: boolean;
    sortColumn: string;
    ascending: boolean;
    status?: string;
    category?: string;
    /** Motif `ilike` déjà échappé. */
    searchPattern?: string;
  }
) {
  let query = db
    .from('partnership_requests')
    .select(PARTNERSHIP_REQUEST_LIST_COLUMNS, {
      count: opts.withTotal ? 'exact' : undefined,
    })
    .order(opts.sortColumn, { ascending: opts.ascending })
    .range(opts.offset, opts.offset + opts.limit - 1);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.category) query = query.eq('category', opts.category);
  if (opts.searchPattern) {
    const s = opts.searchPattern;
    query = query.or(
      `company_name.ilike.${s},contact_name.ilike.${s},email.ilike.${s}`
    );
  }
  const { data, error, count } = await query;
  return { rows: data ?? [], count, error };
}

/** La colonne `status` de toutes les demandes (index-only scan). */
export async function listPartnershipRequestStatuses(db: AdminDb) {
  const { data } = await db.from('partnership_requests').select('status');
  return data ?? [];
}
