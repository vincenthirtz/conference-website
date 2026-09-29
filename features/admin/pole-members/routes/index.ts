// features/admin/pole-members/routes/index.ts
// /api/admin/pole-members — GET liste (limit, includeInactive, poleKey),
// POST création.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidateAssociationPages } from '@/utils/revalidateAssociation';
import { createPoleMember, listPoleMembers } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'pole-members',
  guard: { permission: 'manage_communications' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ req, ctx }) => listPoleMembers(ctx, req.query),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    audit: 'create_pole_member',
    handler: async ({ req, res, ctx }) => {
      const row = await createPoleMember(ctx, req.body);
      ctx.audit({
        entity_type: 'pole_member',
        entity_id: row.id,
        payload: { name: row.name, poleKey: row.pole_key },
      });
      await revalidateAssociationPages(res);
      return row;
    },
  }),
});
