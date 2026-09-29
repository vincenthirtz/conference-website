// features/admin/news/service.ts — actualités du tenant : liste, création,
// édition, suppression, et annonce au bot Discord à la publication.
//
// La revalidation ISR des pages publiques demande la réponse HTTP
// (`res.revalidate`) : c'est la route qui la fait, à partir des slugs que ce
// service lui renvoie.

import slugify from 'slugify';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { emitBotEvent } from '@/utils/botEvents';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import type { NewsPayload } from './schemas';

type QueryValue = string | string[] | undefined;

function normalizeSlug(title?: string, slug?: string) {
  const base = slug?.trim().length ? slug : title || '';
  return slugify(base, { lower: true, strict: true });
}

function normalizeTag(tag?: string) {
  const cleaned = (tag || '').trim();
  if (!cleaned) return 'general';
  return slugify(cleaned, { lower: true, strict: true });
}

/** Le corps tel que reçu : titre et contenu requis, le reste tel quel. */
function requireArticle(raw: unknown): NewsPayload {
  const body = raw as NewsPayload | undefined;
  if (!body?.title || !body.content) {
    throw new ValidationError('Title and content are required.');
  }
  return body;
}

type NewsRow = NonNullable<Awaited<ReturnType<typeof repo.findNews>>['row']>;

/** Annonce « news.published » au bot — best effort, jamais bloquant. */
export function announcePublished(ctx: ServiceContext, row: NewsRow): void {
  void emitBotEvent(
    'news.published',
    {
      newsId: row.id,
      slug: row.slug,
      title: row.title,
      tag: row.tag,
      excerpt: row.excerpt,
      imageUrl: row.image_url,
      publishedAt: row.published_at,
    },
    ctx.tenantId
  ).catch((e) => ctx.logger.error('[botEvents] news.published emit error', e));
}

export async function listNews(
  ctx: ServiceContext,
  query: Record<string, QueryValue>
) {
  const { limit = '50', status, tag } = query;
  const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));

  const { rows, error } = await repo.listNews(ctx.db, ctx.tenantId, {
    limit: limitNum,
    status: status && typeof status === 'string' ? status : undefined,
    tag: tag && typeof tag === 'string' ? normalizeTag(tag) : undefined,
  });
  if (error) {
    ctx.logger.error('[admin/news] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load articles.');
  }
  return { items: rows };
}

export async function createNews(ctx: ServiceContext, raw: unknown) {
  const body = requireArticle(raw);

  const slug = normalizeSlug(body.title, body.slug);
  const publishedAt =
    body.status === 'published'
      ? body.publishedAt
        ? new Date(body.publishedAt).toISOString()
        : new Date().toISOString()
      : null;

  const { row, error } = await repo.insertNews(ctx.db, {
    tenant_id: ctx.tenantId,
    title: body.title as string,
    slug,
    tag: normalizeTag(body.tag),
    excerpt: body.excerpt ?? null,
    content: body.content as string,
    image_url: body.imageUrl ?? null,
    status: body.status ?? 'draft',
    published_at: publishedAt,
    author_id: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
  });
  if (error || !row) {
    ctx.logger.error('[admin/news] create error', error);
    throw new AdminError(500, 'internal', 'Failed to create the article.');
  }

  if (body.status === 'published') announcePublished(ctx, row);
  return row;
}

export async function getNews(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findNews(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/news/id] fetch error', error);
    throw new AdminError(500, 'internal', 'Failed to load the article.');
  }
  if (!row) throw new NotFoundError('Article not found.');
  return row;
}

/**
 * Met à jour l'article. Renvoie aussi les slugs à revalider (l'ancien en
 * plus si le slug a changé, pour purger l'ancienne URL) et si l'article
 * vient d'être publié (annonce à faire APRÈS la revalidation).
 */
export async function updateNews(
  ctx: ServiceContext,
  id: string,
  raw: unknown
) {
  const body = requireArticle(raw);

  const { row: existing, error: existingErr } = await repo.findNewsState(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (existingErr) {
    ctx.logger.error('[admin/news/id] fetch existing error', existingErr);
    throw new AdminError(
      500,
      'internal',
      'Failed to load the existing article.'
    );
  }

  const tagValue = normalizeTag(body.tag ?? existing?.tag ?? '');
  const slug = normalizeSlug(body.title, body.slug);
  let publishedAt: string | null = null;
  if (body.status === 'published') {
    if (body.publishedAt) {
      publishedAt = new Date(body.publishedAt).toISOString();
    } else if (existing?.published_at) {
      publishedAt = existing.published_at;
    } else {
      publishedAt = new Date().toISOString();
    }
  } else {
    publishedAt = existing?.published_at ?? null;
  }

  const { row, error } = await repo.updateNews(ctx.db, ctx.tenantId, id, {
    title: body.title,
    slug,
    tag: tagValue,
    excerpt: body.excerpt ?? null,
    content: body.content,
    image_url: body.imageUrl ?? null,
    status: body.status ?? 'draft',
    published_at: publishedAt,
  });
  if (error || !row) {
    ctx.logger.error('[admin/news/id] update error', error);
    throw new AdminError(500, 'internal', 'Failed to update the article.');
  }

  return {
    row,
    revalidateSlugs:
      existing?.slug && existing.slug !== row.slug
        ? [existing.slug, row.slug]
        : [row.slug],
    justPublished:
      body.status === 'published' && existing?.status !== 'published',
  };
}

/** Supprime l'article ; renvoie son slug (page détail à purger) ou `null`. */
export async function deleteNews(ctx: ServiceContext, id: string) {
  const { slug, error } = await repo.deleteNews(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/news/id] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete the article.');
  }
  return slug;
}

/* ------------------------- Commentaires d'actualités ------------------------ */

type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

export async function listComments(
  ctx: ServiceContext,
  q: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const search = sanitizeSearch(q.search as string | string[] | undefined);
  const newsId = String(q.newsId || '').trim();
  const pattern = search ? `%${escapePostgrestValue(search)}%` : '';

  const { rows, error, count } = await repo.listComments(ctx.db, ctx.tenantId, {
    ...page,
    orClause: search
      ? `content.ilike.${pattern},author_name.ilike.${pattern}`
      : undefined,
    newsId: newsId || undefined,
  });
  if (error) {
    ctx.logger.error('admin comments GET error:', error);
    throw new LegacyAdminError(500, 'Failed to fetch comments');
  }
  return {
    comments: rows as unknown as CommentRow[],
    total: typeof count === 'number' ? count : null,
  };
}

export async function updateComment(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ comment: CommentRow }>> {
  const { id, content, author_name } = body;
  if (!id || typeof id !== 'string') {
    throw new LegacyAdminError(400, 'id is required');
  }
  if (content && `${content}`.trim().length < 3) {
    throw new LegacyAdminError(
      400,
      'content must contain at least 3 characters'
    );
  }
  // Deux champs nommés, rien d'autre ne passe.
  const patch: { content?: string; author_name?: string } = {};
  if (typeof content === 'string') patch.content = content.trim();
  if (typeof author_name === 'string') patch.author_name = author_name.trim();

  const { row, error } = await repo.updateComment(
    ctx.db,
    ctx.tenantId,
    id,
    patch
  );
  if (error) {
    ctx.logger.error('admin comments PATCH error:', error);
    throw new LegacyAdminError(500, 'Failed to update comment');
  }
  return {
    result: { comment: row as unknown as CommentRow },
    audit: {
      entity_type: 'comment',
      entity_id: id,
      payload: { fields: Object.keys(patch) },
    },
  };
}

export async function deleteComment(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ deleted: true }>> {
  const { id } = body;
  if (!id || typeof id !== 'string') {
    throw new LegacyAdminError(400, 'id is required');
  }
  const { error } = await repo.deleteComment(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('admin comments DELETE error:', error);
    throw new LegacyAdminError(500, 'Failed to delete comment');
  }
  return {
    result: { deleted: true },
    audit: { entity_type: 'comment', entity_id: id },
  };
}
