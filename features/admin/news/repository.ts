// features/admin/news/repository.ts — accès base des actualités, scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { COMMENT_COLUMNS, NEWS_COLUMNS } from './schemas';
import {
  isMissingColumnError,
  withDeletedAtFallback,
} from '../recycle-bin/missingColumn';

type NewsInsert = Database['public']['Tables']['news']['Insert'];
type NewsUpdate = Database['public']['Tables']['news']['Update'];

// SUPPRESSION DOUCE. Une actualité supprimée garde sa ligne (`deleted_at`) et
// passe en brouillon : la corbeille peut la rendre, et toutes les lectures
// PUBLIQUES (qui filtrent `status = 'published'`) cessent de la voir sans
// dépendre de `deleted_at`. Les lectures ADMIN ci-dessous l'excluent par
// `deleted_at IS NULL`, avec repli tant que la migration
// add_news_soft_delete.sql n'est pas appliquée (cf. recycle-bin/missingColumn).
// La purge définitive passe par la corbeille (features/admin/recycle-bin/purge).

export async function listNews(
  db: AdminDb,
  tenantId: string,
  opts: { limit: number; status?: string; tag?: string }
) {
  const { data, error } = await withDeletedAtFallback((filterDeleted) => {
    let query = db
      .from('news')
      .select(NEWS_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(opts.limit);
    if (filterDeleted) query = query.is('deleted_at', null);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.tag) query = query.eq('tag', opts.tag);
    return query;
  });
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
  const { data, error } = await withDeletedAtFallback((filterDeleted) => {
    const q = db
      .from('news')
      .select(NEWS_COLUMNS)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    return (filterDeleted ? q.is('deleted_at', null) : q).maybeSingle();
  });
  return { row: data ?? null, error };
}

/** L'état utile à une mise à jour (date de publication, slug à purger). */
export async function findNewsState(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await withDeletedAtFallback((filterDeleted) => {
    const q = db
      .from('news')
      .select('published_at, status, tag, slug')
      .eq('id', id)
      .eq('tenant_id', tenantId);
    return (filterDeleted ? q.is('deleted_at', null) : q).maybeSingle();
  });
  return { row: data ?? null, error };
}

export async function updateNews(
  db: AdminDb,
  tenantId: string,
  id: string,
  payload: NewsUpdate
) {
  // Une actualité en corbeille ne se modifie pas : republiée par cette voie,
  // elle redeviendrait publique (les lectures publiques ne lisent que
  // `status`) tout en restant listée dans la corbeille.
  const { data, error } = await withDeletedAtFallback((filterDeleted) => {
    const q = db
      .from('news')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    return (filterDeleted ? q.is('deleted_at', null) : q)
      .select(NEWS_COLUMNS)
      .single();
  });
  return { row: data ?? null, error };
}

/**
 * Met l'actualité à la corbeille (`deleted_at` + brouillon) et renvoie son
 * slug (pour purger la page détail). Le statut d'origine n'est pas conservé :
 * une actualité restaurée revient en BROUILLON, à republier sciemment.
 *
 * Repli : sans la colonne `deleted_at` (migration add_news_soft_delete.sql
 * non appliquée), effacement définitif comme avant.
 */
export async function deleteNews(db: AdminDb, tenantId: string, id: string) {
  const now = new Date().toISOString();
  const soft = await db
    .from('news')
    .update({ deleted_at: now, status: 'draft', updated_at: now })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('slug')
    .maybeSingle();
  if (!isMissingColumnError(soft.error, 'deleted_at')) {
    return { slug: soft.data?.slug ?? null, error: soft.error };
  }
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
