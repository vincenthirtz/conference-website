// features/admin/tenants/routes/webhooks.ts — /api/admin/webhooks (espace ACTIF)
//   GET  : abonnements (métadonnées, jamais le secret).
//   POST : création ; le secret de signature n'est rendu qu'ici, une fois.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { WebhookCreateDoc } from '../schemas';
import {
  createWebhookSubscription,
  listWebhookSubscriptions,
} from '../service/integrations';
import { staffScope } from '../service/scope';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-webhooks',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => listWebhookSubscriptions(ctx),
  }),
  POST: mutate({
    body: WebhookCreateDoc,
    rateLimit: LIMIT,
    status: 201,
    // Le secret ne doit jamais atterrir dans le cache d'idempotence.
    idempotent: false,
    audit: 'create_webhook',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        createWebhookSubscription(ctx, staffScope(ctx.staff), req.body)
      ),
  }),
});
