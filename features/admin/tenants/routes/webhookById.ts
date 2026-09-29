// features/admin/tenants/routes/webhookById.ts — /api/admin/webhooks/[id]
//   PATCH  : active / désactive (réactiver remet les échecs à zéro).
//   DELETE : supprime (CASCADE des livraisons).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, WebhookPatchDoc } from '../schemas';
import {
  deleteWebhookSubscription,
  setWebhookEnabled,
} from '../service/integrations';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-webhooks-id',
  guard: { permission: 'manage_settings' },
  PATCH: mutate({
    query: IdQuery,
    body: WebhookPatchDoc,
    rateLimit: LIMIT,
    // Slug déclaré ; la désactivation le remplace (`disable_webhook`).
    audit: 'enable_webhook',
    handler: ({ ctx, req }) =>
      audited(ctx, setWebhookEnabled(ctx, req.query.id, req.body)),
  }),
  DELETE: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    audit: 'delete_webhook',
    handler: ({ ctx, req }) =>
      audited(ctx, deleteWebhookSubscription(ctx, req.query.id)),
  }),
});
