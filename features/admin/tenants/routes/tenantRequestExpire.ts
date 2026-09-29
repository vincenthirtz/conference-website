// features/admin/tenants/routes/tenantRequestExpire.ts
// POST /api/admin/tenant-requests/[id]/expire — sortie manuelle d'une
// demande `pending_*` (motif obligatoire pour un refus). Owner de la PLATEFORME.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery } from '../schemas';
import { closeTenantRequest } from '../service/integrations';

const guard = { permission: 'manage_tenant', scope: 'platform' } as const;
const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenant-requests-expire',
  guard,
  POST: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    audit: 'expire_tenant_request',
    handler: ({ ctx, req }) =>
      audited(ctx, closeTenantRequest(ctx, req.query.id, 'expire', undefined)),
  }),
});
