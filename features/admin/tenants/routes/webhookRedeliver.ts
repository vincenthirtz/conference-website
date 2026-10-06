// features/admin/tenants/routes/webhookRedeliver.ts
// POST /api/admin/webhooks/[id]/redeliver { deliveryId } — renvoie une
// livraison échouée (corps d'origine relu dans l'outbox, secret courant).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, WebhookRedeliverDoc } from '../schemas';
import { redeliverWebhookDelivery } from '../service/integrations';

export default defineAdminRoute({
  key: 'admin-webhook-redeliver',
  guard: { permission: 'manage_settings' },
  POST: mutate({
    query: IdQuery,
    body: WebhookRedeliverDoc,
    rateLimit: { max: 10, windowMs: 60_000 },
    // Idempotence par défaut : un double clic (même Idempotency-Key) ne
    // renvoie pas deux fois.
    audit: 'redeliver_webhook',
    handler: ({ ctx, req }) =>
      audited(ctx, redeliverWebhookDelivery(ctx, req.query.id, req.body)),
  }),
});
