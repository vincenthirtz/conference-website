// features/admin/tenants/routes/lifecycle.ts — POST /api/admin/tenants/[id]/lifecycle
// Suspendre, archiver, programmer une purge, rouvrir. Motif obligatoire hors
// `active` ; l'espace protégé ne sort pas d'`active`.
//
// Garde CONSERVÉE à l'identique (`manage_tenant`, portée tenant, + owner
// effectif) — cf. rapport de migration : sans `scope: 'platform'`, un
// propriétaire d'espace peut viser un AUTRE espace par son id.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, LifecycleDoc } from '../schemas';
import { staffScope } from '../service/scope';
import { changeLifecycle } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenant-lifecycle',
  guard: { permission: 'manage_tenant' },
  POST: mutate({
    query: IdQuery,
    body: LifecycleDoc,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: 'tenant_lifecycle',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        changeLifecycle(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
});
