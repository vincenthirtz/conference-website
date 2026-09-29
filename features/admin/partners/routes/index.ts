// features/admin/partners/routes/index.ts
// /api/admin/partners — GET liste paginée (filtres, tri allowlist), POST
// création (logo recopié chez nous).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { createPartner, listPartners } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'partners',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ req, ctx }) =>
      listPartners(
        ctx,
        parsePagination(req, { limit: 50, maxLimit: 200 }),
        req.query
      ),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    audit: 'settings_update',
    handler: async ({ req, ctx }) => {
      const row = await createPartner(ctx, req.body);
      ctx.audit({
        entity_type: 'partner',
        entity_id: row.id,
        payload: { name: row.name, category: row.category },
      });
      return row;
    },
  }),
});
