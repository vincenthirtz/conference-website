// features/admin/partners/routes/byId.ts
// /api/admin/partners/[id] — GET, PATCH partiel, DELETE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { PartnerIdQuery } from '../schemas';
import { deletePartner, getPartner, updatePartner } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'partners-id',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    query: PartnerIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getPartner(ctx, query.id),
  }),
  PATCH: mutate({
    query: PartnerIdQuery,
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ query, req, ctx }) => {
      const { row, updates } = await updatePartner(ctx, query.id, req.body);
      ctx.audit({
        entity_type: 'partner',
        entity_id: query.id,
        payload: { updates },
      });
      return row;
    },
  }),
  DELETE: mutate({
    query: PartnerIdQuery,
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ query, ctx }) => {
      const { name } = await deletePartner(ctx, query.id);
      ctx.audit({
        entity_type: 'partner',
        entity_id: query.id,
        payload: { name, deleted: true },
      });
      return { success: true as const };
    },
  }),
});
