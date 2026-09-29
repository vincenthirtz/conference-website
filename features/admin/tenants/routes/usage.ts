// features/admin/tenants/routes/usage.ts — GET /api/admin/tenants/usage
// Consommation d'API du mois, TOUS les espaces : owner de la PLATEFORME.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TenantUsageQuery } from '../schemas';
import { tenantsUsage } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenants-usage',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    query: TenantUsageQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) => tenantsUsage(ctx, req.query.window),
  }),
});
