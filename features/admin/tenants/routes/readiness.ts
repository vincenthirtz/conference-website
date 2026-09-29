// features/admin/tenants/routes/readiness.ts — GET /api/admin/tenants/readiness
// « Qu'est-ce qui manque à chaque espace pour fonctionner ? » Supervision
// transverse : owner de la PLATEFORME (un propriétaire d'espace porte
// `manage_tenant` chez lui — la portée compte autant que la permission).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { tenantsReadiness } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenants-readiness',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => tenantsReadiness(ctx),
  }),
});
