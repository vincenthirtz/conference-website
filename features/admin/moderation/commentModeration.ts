// features/admin/moderation/commentModeration.ts — modération des commentaires
// d'actualités : file filtrée par statut, actions en masse (réafficher,
// masquer, supprimer une sélection), mode « pré-modération » du tenant et
// fermeture des commentaires d'un article.
//
// L'édition/suppression unitaire reste sur /api/admin/comments (module news).
// Ici : ce qui dépend de la migration news_comments_moderation.sql. Avant son
// application, la file se lit sans statut (tout est visible), les actions de
// statut et la fermeture répondent 503, et l'écran les masque
// (`status_available` / `closure_available`).

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ServiceUnavailableError,
} from '@/utils/admin/errors';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import {
  COMMENT_MODERATION_SETTING_KEY,
  COMMENT_STATUSES,
  type CommentStatus,
  parseModerationMode,
} from '@/utils/moderation/newsComments';
import { getSetting, setSetting } from '@/utils/siteSettings';
import type { Audited } from '../_shared/audited';
import type {
  CommentArticleClosureBody,
  CommentBulkBody,
  CommentSettingsBody,
} from './schemas';

export const STATUS_MIGRATION_PENDING =
  'La modération des commentaires n’est pas encore disponible : la migration news_comments_moderation n’est pas appliquée.';

const BASE_COLUMNS =
  'id, news_id, author_name, content, created_at, news:news(id, title, slug)';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ModeratedComment = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  status: CommentStatus;
  news: { id: string; title: string | null; slug: string | null } | null;
};

// Accès non typé réservé aux deux lectures DYNAMIQUES (sélection avec ou sans
// `status` selon le repli 42703, sonde de colonne) : le reste passe par le
// client typé. Toujours scopé par `ctx.tenantId`.
type LooseDb = { from: (table: string) => any };
function db(ctx: ServiceContext): LooseDb {
  return ctx.db as unknown as LooseDb;
}

function statusFilter(value: unknown): CommentStatus | null {
  return typeof value === 'string' &&
    (COMMENT_STATUSES as readonly string[]).includes(value)
    ? (value as CommentStatus)
    : null;
}

/* ---------------------------------------------------------------------------
 * File de modération
 * ------------------------------------------------------------------------ */

export async function listModeratedComments(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const search = sanitizeSearch(query.search as string | string[] | undefined);
  const pattern = search ? `%${escapePostgrestValue(search)}%` : '';
  const newsId =
    typeof query.news_id === 'string' && UUID_RE.test(query.news_id)
      ? query.news_id
      : null;
  const status = statusFilter(query.status);

  const run = (withStatus: boolean) => {
    let q = db(ctx)
      .from('news_comments')
      .select(withStatus ? `${BASE_COLUMNS}, status` : BASE_COLUMNS, {
        count: 'exact',
      })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(page.offset, page.offset + page.limit - 1);
    if (pattern) {
      q = q.or(`content.ilike.${pattern},author_name.ilike.${pattern}`);
    }
    if (newsId) q = q.eq('news_id', newsId);
    if (withStatus && status) q = q.eq('status', status);
    return q;
  };

  let statusAvailable = true;
  let res = await run(true);
  if (res.error && isMissingColumnError(res.error, 'status')) {
    statusAvailable = false;
    // Sans colonne, tout est visible : un filtre « en attente » / « masqués »
    // est vide par construction.
    res =
      status && status !== 'visible'
        ? { data: [], count: 0, error: null }
        : await run(false);
  }
  if (res.error) {
    ctx.logger.error('[admin/moderation/comments] list error', res.error);
    throw new AdminError(500, 'internal', 'Failed to fetch comments');
  }

  let pending = 0;
  if (statusAvailable) {
    const { count } = await ctx.db
      .from('news_comments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending');
    pending = typeof count === 'number' ? count : 0;
  }

  const comments = ((res.data ?? []) as Array<Partial<ModeratedComment>>).map(
    (row) => ({ ...row, status: row.status ?? 'visible' }) as ModeratedComment
  );
  return {
    comments,
    total: typeof res.count === 'number' ? res.count : null,
    counts: { pending },
    status_available: statusAvailable,
  };
}

/* ---------------------------------------------------------------------------
 * Actions en masse
 * ------------------------------------------------------------------------ */

export async function bulkModerateComments(
  ctx: ServiceContext,
  body: z.output<typeof CommentBulkBody>
): Promise<Audited<{ action: string; affected: number; ids: string[] }>> {
  const ids = [...new Set(body.ids)];
  const table = ctx.db.from('news_comments');
  const scoped =
    body.action === 'delete'
      ? table.delete()
      : table.update({ status: body.action === 'hide' ? 'hidden' : 'visible' });
  const { data, error } = await scoped
    .eq('tenant_id', ctx.tenantId)
    .in('id', ids)
    .select('id');
  if (error) {
    if (isMissingColumnError(error, 'status')) {
      throw new ServiceUnavailableError(STATUS_MIGRATION_PENDING);
    }
    ctx.logger.error('[admin/moderation/comments] bulk error', error);
    throw new AdminError(500, 'internal', 'Failed to moderate comments');
  }
  const affectedIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  return {
    result: {
      action: body.action,
      affected: affectedIds.length,
      ids: affectedIds,
    },
    audit: {
      entity_type: 'news_comment',
      entity_id: affectedIds.length === 1 ? affectedIds[0] : null,
      payload: {
        action: body.action,
        requested: ids.length,
        affected: affectedIds.length,
        ids: affectedIds,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * Réglages : pré-modération, articles fermés
 * ------------------------------------------------------------------------ */

async function probeColumn(
  ctx: ServiceContext,
  table: string,
  column: string
): Promise<boolean> {
  const { error } = await db(ctx)
    .from(table)
    .select(column)
    .eq('tenant_id', ctx.tenantId)
    .limit(1);
  return !(error && isMissingColumnError(error, column));
}

export async function getCommentSettings(ctx: ServiceContext) {
  const [mode, statusAvailable, closed] = await Promise.all([
    getSetting(COMMENT_MODERATION_SETTING_KEY, ctx.tenantId),
    probeColumn(ctx, 'news_comments', 'status'),
    ctx.db
      .from('news')
      .select('id, title, slug')
      .eq('tenant_id', ctx.tenantId)
      .eq('comments_closed', true)
      .order('published_at', { ascending: false })
      .limit(100),
  ]);
  const closureAvailable = !(
    closed.error && isMissingColumnError(closed.error, 'comments_closed')
  );
  if (closed.error && closureAvailable) {
    ctx.logger.error(
      '[admin/moderation/comments] closed list error',
      closed.error
    );
  }
  return {
    pre_moderation: parseModerationMode(mode) === 'pre',
    status_available: statusAvailable,
    closure_available: closureAvailable,
    closed_articles: (closed.error ? [] : (closed.data ?? [])) as Array<{
      id: string;
      title: string | null;
      slug: string | null;
    }>,
  };
}

export async function updateCommentSettings(
  ctx: ServiceContext,
  body: z.output<typeof CommentSettingsBody>
): Promise<Audited<{ pre_moderation: boolean }>> {
  // Pré-modération sans colonne `status` : les commentaires seraient publiés
  // quand même (repli de la route publique) — on refuse plutôt que de mentir.
  if (
    body.pre_moderation &&
    !(await probeColumn(ctx, 'news_comments', 'status'))
  ) {
    throw new ServiceUnavailableError(STATUS_MIGRATION_PENDING);
  }
  const ok = await setSetting(
    COMMENT_MODERATION_SETTING_KEY,
    body.pre_moderation ? 'pre' : 'post',
    {
      tenantId: ctx.tenantId,
      description:
        'Commentaires d’actualités : pre = pré-modération, post = publication directe.',
    }
  );
  if (!ok) {
    throw new AdminError(500, 'internal', 'Failed to save the setting');
  }
  return {
    result: { pre_moderation: body.pre_moderation },
    audit: {
      entity_type: 'site_setting',
      entity_id: null,
      payload: {
        key: COMMENT_MODERATION_SETTING_KEY,
        pre_moderation: body.pre_moderation,
      },
    },
  };
}

export async function setArticleCommentsClosed(
  ctx: ServiceContext,
  body: z.output<typeof CommentArticleClosureBody>
): Promise<
  Audited<{ id: string; title: string | null; comments_closed: boolean }>
> {
  const { data, error } = await ctx.db
    .from('news')
    .update({ comments_closed: body.comments_closed })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', body.news_id)
    .select('id, title')
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error, 'comments_closed')) {
      throw new ServiceUnavailableError(STATUS_MIGRATION_PENDING);
    }
    ctx.logger.error('[admin/moderation/comments] closure error', error);
    throw new AdminError(500, 'internal', 'Failed to update the article');
  }
  if (!data) throw new NotFoundError('Article introuvable.');
  const row = data as { id: string; title: string | null };
  return {
    result: { ...row, comments_closed: body.comments_closed },
    audit: {
      entity_type: 'news',
      entity_id: row.id,
      payload: { comments_closed: body.comments_closed },
    },
  };
}
