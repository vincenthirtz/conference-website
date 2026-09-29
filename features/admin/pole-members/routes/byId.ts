// features/admin/pole-members/routes/byId.ts
// /api/admin/pole-members/[id] — GET, PATCH partiel, DELETE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidateAssociationPages } from '@/utils/revalidateAssociation';
import { PoleMemberIdQuery } from '../schemas';
import { deletePoleMember, getPoleMember, updatePoleMember } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'pole-members-id',
  guard: { permission: 'manage_communications' },
  GET: read({
    query: PoleMemberIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getPoleMember(ctx, query.id),
  }),
  PATCH: mutate({
    query: PoleMemberIdQuery,
    rateLimit: LIMIT,
    audit: 'update_pole_member',
    handler: async ({ query, req, res, ctx }) => {
      const { row, fields } = await updatePoleMember(ctx, query.id, req.body);
      ctx.audit({
        entity_type: 'pole_member',
        entity_id: query.id,
        payload: { fields },
      });
      await revalidateAssociationPages(res);
      return row;
    },
  }),
  DELETE: mutate({
    query: PoleMemberIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'delete_pole_member',
    handler: async ({ query, res, ctx }) => {
      await deletePoleMember(ctx, query.id);
      ctx.audit({ entity_type: 'pole_member', entity_id: query.id });
      await revalidateAssociationPages(res);
    },
  }),
});
