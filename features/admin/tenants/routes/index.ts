// features/admin/tenants/routes/index.ts — /api/admin/tenants
//   GET  : espaces visibles (tous pour le staff de plateforme, les siens sinon).
//   POST : création (owner, jamais depuis un compte développeur), avec essai.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TenantCreateDoc } from '../schemas';
import { staffScope } from '../service/scope';
import { createTenant, listTenants } from '../service/tenants';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenants-create',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => listTenants(ctx, staffScope(ctx.staff)),
  }),
  POST: mutate({
    body: TenantCreateDoc,
    rateLimit: LIMIT,
    status: 201,
    audit: 'create_tenant',
    handler: ({ ctx, req }) =>
      audited(ctx, createTenant(ctx, staffScope(ctx.staff), req.body)),
  }),
});
