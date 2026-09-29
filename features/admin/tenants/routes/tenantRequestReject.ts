// features/admin/tenants/routes/tenantRequestReject.ts
// POST /api/admin/tenant-requests/[id]/reject — sortie manuelle d'une
// demande `pending_*` (motif obligatoire pour un refus). Owner de la PLATEFORME.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, TenantRequestRejectDoc } from '../schemas';
import { closeTenantRequest } from '../service/integrations';

const guard = { permission: 'manage_tenant', scope: 'platform' } as const;
const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenant-requests-reject',
  guard,
  POST: mutate({
    query: IdQuery,
    body: TenantRequestRejectDoc,
    rateLimit: LIMIT,
    audit: 'reject_tenant_request',
    handler: ({ ctx, req }) =>
      audited(ctx, closeTenantRequest(ctx, req.query.id, 'reject', req.body)),
  }),
});
