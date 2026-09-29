// features/admin/tenants/routes/tenantRequests.ts — GET /api/admin/tenant-requests
// File des demandes d'onboarding self-service (auto-approuvées) : owner de la
// PLATEFORME. Aucun jeton de la demande n'est rendu.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TenantRequestListQuery } from '../schemas';
import { listTenantRequests } from '../service/integrations';

export default defineAdminRoute({
  key: 'admin-tenant-requests-list',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    query: TenantRequestListQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) => listTenantRequests(ctx, req.query),
  }),
});
