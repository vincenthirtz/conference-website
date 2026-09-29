// features/admin/tenants/routes/billing.ts — GET /api/admin/tenants/[id]/billing
// État de facturation (lecture) ; espace ACTIF seulement, sauf pôle-admin.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { getBilling } from '../service/settings';

export default defineAdminRoute({
  key: 'admin-tenant-billing',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: IdQuery,
    handler: ({ ctx, req }) =>
      getBilling(ctx, staffScope(ctx.staff), req.query.id),
  }),
});
