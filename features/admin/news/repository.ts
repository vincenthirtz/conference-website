// features/admin/news/repository.ts — accès base des actualités, scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { NEWS_COLUMNS } from './schemas';

type NewsInsert = Database['public']['Tables']['news']['Insert'];
type NewsUpdate = Database['public']['Tables']['news']['Update'];

export async function listNews(
  db: AdminDb,
  tenantId: string,
  opts: { limit: number; status?: string; tag?: string }
) {
  let query = db
    .from('news')
    .select(NEWS_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.tag) query = query.eq('tag', opts.tag);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

export async function insertNews(db: AdminDb, payload: NewsInsert) {
  const { data, error } = await db
    .from('news')
    .insert(payload)
    .select(NEWS_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function findNews(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('news')
    .select(NEWS_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

/** L'état utile à une mise à jour (date de publication, slug à purger). */
export async function findNewsState(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('news')
    .select('published_at, status, tag, slug')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateNews(
  db: AdminDb,
  tenantId: string,
  id: string,
  payload: NewsUpdate
) {
  const { data, error } = await db
    .from('news')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(NEWS_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

/** Supprime et renvoie le slug (pour purger la page détail). */
export async function deleteNews(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('news')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('slug')
    .maybeSingle();
  return { slug: data?.slug ?? null, error };
}
