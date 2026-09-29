// features/admin/news/routes/index.ts
// /api/admin/news — GET liste (limit, status, tag), POST création.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { createNews, listNews } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'news',
  guard: { permission: 'manage_communications' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ req, ctx }) => listNews(ctx, req.query),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    audit: 'publish_news',
    handler: async ({ req, ctx }) => {
      const row = await createNews(ctx, req.body);
      ctx.audit({
        entity_type: 'news',
        entity_id: row.id,
        payload: { title: row.title, slug: row.slug, status: row.status },
      });
      return row;
    },
  }),
});
