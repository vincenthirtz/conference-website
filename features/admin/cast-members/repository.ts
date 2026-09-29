// features/admin/cast-members/repository.ts — fiches cast, scopées tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { CAST_MEMBER_COLUMNS, CAST_MEMBER_LIST_COLUMNS } from './schemas';

type CastMemberInsert = Database['public']['Tables']['cast_members']['Insert'];
type CastMemberUpdate = Database['public']['Tables']['cast_members']['Update'];

export async function listCastMembers(
  db: AdminDb,
  tenantId: string,
  opts: {
    limit: number;
    offset: number;
    withTotal: boolean;
    /** `undefined` = pas de filtre de statut. */
    isActive?: boolean;
    /** Motif `ilike` déjà échappé. */
    searchPattern?: string;
    orderColumn: string;
    ascending: boolean;
  }
) {
  let query = db
    .from('cast_members')
    .select(CAST_MEMBER_LIST_COLUMNS, {
      count: opts.withTotal ? 'exact' : undefined,
    })
    .eq('tenant_id', tenantId)
    // Les fiches internes (auto-provision admin/owner) ne sont pas des
    // casteurs publics : masquées de l'UI de gestion. Le CRUD par id ne
    // l'est pas.
    .eq('is_internal', false);
  if (opts.isActive !== undefined) query = query.eq('is_active', opts.isActive);
  if (opts.searchPattern) {
    const s = opts.searchPattern;
    query = query.or(`name.ilike.${s},title.ilike.${s},city.ilike.${s}`);
  }
  const { data, error, count } = await query
    .order(opts.orderColumn, { ascending: opts.ascending })
    // tri secondaire stable
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  return { rows: data ?? [], count, error };
}

/** Plus grand `sort_order` du tenant (pour placer une fiche en fin). */
export async function maxSortOrder(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('cast_members')
    .select('sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  return data?.sort_order ?? 0;
}

export async function insertCastMember(
  db: AdminDb,
  payload: CastMemberInsert & { tenant_id: string }
) {
  const { data, error } = await db
    .from('cast_members')
    .insert(payload)
    .select(CAST_MEMBER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function findCastMember(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('cast_members')
    .select(CAST_MEMBER_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  return { row: data ?? null, error };
}

export async function updateCastMember(
  db: AdminDb,
  tenantId: string,
  id: string,
  payload: CastMemberUpdate
) {
  const { data, error } = await db
    .from('cast_members')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(CAST_MEMBER_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deleteCastMember(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('cast_members')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ---- Casters disponibles ---- */

/**
 * Comptes staff de rôle `caster`. La table `staff` est GLOBALE (un compte
 * staff n'appartient pas à un tenant) : pas de scope tenant, comme avant.
 */
export async function listCasterStaff(db: AdminDb) {
  const { data, error } = await db
    .from('staff')
    .select('auth_user_id, display_name, email, avatar_url')
    .eq('role', 'caster');
  return { rows: data ?? [], error };
}

/** Fiches publiques du tenant liées à ces comptes. */
export async function listLinkedCastMembers(
  db: AdminDb,
  tenantId: string,
  userIds: string[]
) {
  const { data, error } = await db
    .from('cast_members')
    .select('id, auth_user_id')
    .eq('tenant_id', tenantId)
    // Les fiches internes ne sont pas assignables à un match.
    .eq('is_internal', false)
    .in('auth_user_id', userIds);
  return { rows: data ?? [], error };
}

/** Fiches déjà assignées à un match planifié dans [lo, hi]. */
export async function listBusyCastMemberIds(
  db: AdminDb,
  tenantId: string,
  lo: string,
  hi: string
) {
  const { data, error } = await db
    .from('cast_assignments')
    .select('cast_member_id, match:match_id!inner(id, scheduled_at)')
    .eq('tenant_id', tenantId)
    .gte('match.scheduled_at', lo)
    .lte('match.scheduled_at', hi);
  return {
    ids: (data ?? []).map((b) => b.cast_member_id).filter(Boolean),
    error,
  };
}
