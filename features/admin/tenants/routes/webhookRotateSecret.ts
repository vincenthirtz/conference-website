// features/admin/tenants/routes/webhookRotateSecret.ts
// POST /api/admin/webhooks/[id]/rotate-secret — nouveau secret de signature,
// rendu une seule fois.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery } from '../schemas';
import { rotateWebhookSecret } from '../service/integrations';

export default defineAdminRoute({
  key: 'admin-webhook-rotate-secret',
  guard: { permission: 'manage_settings' },
  POST: mutate({
    query: IdQuery,
    rateLimit: { max: 5, windowMs: 60_000 },
    // Le secret ne doit jamais atterrir dans le cache d'idempotence.
    idempotent: false,
    audit: 'rotate_webhook_secret',
    handler: ({ ctx, req }) =>
      audited(ctx, rotateWebhookSecret(ctx, req.query.id)),
  }),
});
