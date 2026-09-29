// features/admin/adherents/routes/helloassoSync.ts
// POST /api/admin/helloasso/sync — importe les adhésions HelloAsso dans
// `adherents` (création / mise à jour du paiement).

import {
  defineAdminRoute,
  mutate,
} from '../../../../utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { HelloAssoSyncQuery } from '../schemas';
import { syncHelloAssoMemberships } from '../service';

export default defineAdminRoute({
  key: 'admin-helloasso-sync',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_billing', scope: 'platform' },
  POST: mutate({
    query: HelloAssoSyncQuery,
    rateLimit: { max: 5, windowMs: 60_000 },
    // Ex-`other` + `payload.action: 'helloasso_sync'` (payload conservé).
    audit: 'helloasso_sync',
    handler: ({ query, ctx }) =>
      audited(
        ctx,
        syncHelloAssoMemberships(ctx, query, ctx.staff.staff.id ?? null)
      ),
  }),
});
