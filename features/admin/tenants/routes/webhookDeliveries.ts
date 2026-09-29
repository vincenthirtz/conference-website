// features/admin/tenants/routes/webhookDeliveries.ts
// GET /api/admin/webhooks/[id]/deliveries — 50 dernières livraisons d'un
// abonnement de l'espace actif.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { IdQuery } from '../schemas';
import { listDeliveries } from '../service/integrations';

export default defineAdminRoute({
  key: 'admin-webhook-deliveries',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: IdQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) => listDeliveries(ctx, req.query.id),
  }),
});
