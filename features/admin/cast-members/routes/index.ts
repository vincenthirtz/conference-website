// features/admin/cast-members/routes/index.ts
// /api/admin/cast-members — GET liste paginée (statut, recherche, tri
// allowlist), POST création (liaison optionnelle à un compte caster).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { revalidateAssociationPages } from '@/utils/revalidateAssociation';
import { createCastMember, listCastMembers } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'cast-members',
  guard: { permission: 'manage_communications' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ req, ctx }) =>
      listCastMembers(
        ctx,
        parsePagination(req, { limit: 50, maxLimit: 200 }),
        req.query
      ),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    audit: 'create_cast_member',
    handler: async ({ req, res, ctx }) => {
      const row = await createCastMember(ctx, req.body);
      ctx.audit({
        entity_type: 'cast_member',
        entity_id: row.id,
        payload: { name: row.name, isActive: row.is_active },
      });
      await revalidateAssociationPages(res);
      return row;
    },
  }),
});
