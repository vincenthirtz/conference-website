// features/admin/cast-members/routes/byId.ts
// /api/admin/cast-members/[id] — GET, PATCH partiel, DELETE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidateAssociationPages } from '@/utils/revalidateAssociation';
import { CastMemberIdQuery } from '../schemas';
import { deleteCastMember, getCastMember, updateCastMember } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'cast-members-id',
  guard: { permission: 'manage_communications' },
  GET: read({
    query: CastMemberIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getCastMember(ctx, query.id),
  }),
  PATCH: mutate({
    query: CastMemberIdQuery,
    rateLimit: LIMIT,
    audit: 'update_cast_member',
    handler: async ({ query, req, res, ctx }) => {
      const { row, fields } = await updateCastMember(ctx, query.id, req.body);
      ctx.audit({
        entity_type: 'cast_member',
        entity_id: query.id,
        payload: { fields },
      });
      await revalidateAssociationPages(res);
      return row;
    },
  }),
  DELETE: mutate({
    query: CastMemberIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'delete_cast_member',
    handler: async ({ query, res, ctx }) => {
      await deleteCastMember(ctx, query.id);
      ctx.audit({ entity_type: 'cast_member', entity_id: query.id });
      await revalidateAssociationPages(res);
    },
  }),
});
