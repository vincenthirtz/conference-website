// features/admin/news/routes/byId.ts
// /api/admin/news/[id] — GET, PUT (remplacement), DELETE.
//
// Les pages publiques des actualités sont en ISR (revalidate: 900) : sans
// revalidation à la demande, un article modifié ou supprimé resterait affiché
// jusqu'à 15 min (même mécanique que l'ingestion POST /api/news).

import type { NextApiResponse } from 'next';
import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { logger } from '@/utils/logger';
import { NewsIdQuery } from '../schemas';
import { announcePublished, deleteNews, getNews, updateNews } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

async function revalidateNewsPages(res: NextApiResponse, slugs: string[]) {
  const paths = [
    '/',
    '/actualites',
    ...slugs.filter(Boolean).map((slug) => `/news/${slug}`),
  ];
  await Promise.all(
    paths.map((path) =>
      res.revalidate(path).catch((err) => {
        logger.error(`[admin/news/id] revalidate ${path} failed`, err);
      })
    )
  );
}

export default defineAdminRoute({
  key: 'news-id',
  guard: { permission: 'manage_communications' },
  GET: read({
    query: NewsIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getNews(ctx, query.id),
  }),
  PUT: mutate({
    query: NewsIdQuery,
    rateLimit: LIMIT,
    // Lot A10 : modification et suppression journalisées sous l'entité `news`
    // (même id que la création) — c'est ce que lit l'historique de la fiche.
    audit: 'update_news',
    handler: async ({ query, req, res, ctx }) => {
      const { row, revalidateSlugs, justPublished } = await updateNews(
        ctx,
        query.id,
        req.body
      );
      ctx.audit({
        entity_type: 'news',
        entity_id: query.id,
        payload: { title: row.title, slug: row.slug, status: row.status },
      });
      await revalidateNewsPages(res, revalidateSlugs);
      if (justPublished) announcePublished(ctx, row);
      return row;
    },
  }),
  DELETE: mutate({
    query: NewsIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'delete_news',
    handler: async ({ query, res, ctx }) => {
      const slug = await deleteNews(ctx, query.id);
      ctx.audit({
        entity_type: 'news',
        entity_id: query.id,
        payload: { slug, deleted: true },
      });
      if (slug) await revalidateNewsPages(res, [slug]);
    },
  }),
});
