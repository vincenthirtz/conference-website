// features/admin/tenants/routes/overview.ts — GET /api/admin/tenants/[id]/overview
// Signes de vie, volumes, mise en service d'UN espace ; même accès que la
// fiche (garde `caster`, admin+ ou staff rattaché, contrôlé par le service).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { tenantOverview } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenant-overview',
  guard: 'caster',
  GET: read({
    query: IdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      tenantOverview(ctx, staffScope(ctx.staff), req.query.id),
  }),
});
