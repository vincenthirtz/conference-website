// features/admin/news/repository.ts — accès base des actualités, scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { COMMENT_COLUMNS, NEWS_COLUMNS } from './schemas';

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

/* ------------------------- Commentaires d'actualités ------------------------ */

export async function listComments(
  db: AdminDb,
  tenantId: string,
  f: { limit: number; offset: number; orClause?: string; newsId?: string }
) {
  let query = db
    .from('news_comments')
    .select(COMMENT_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.orClause) query = query.or(f.orClause);
  if (f.newsId) query = query.eq('news_id', f.newsId);
  const { data, error, count } = await query;
  return { rows: data ?? [], error, count };
}

export async function updateComment(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: { content?: string; author_name?: string }
) {
  const { data, error } = await db
    .from('news_comments')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteComment(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('news_comments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
