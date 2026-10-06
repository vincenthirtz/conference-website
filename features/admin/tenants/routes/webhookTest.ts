// features/admin/tenants/routes/webhookTest.ts
// POST /api/admin/webhooks/[id]/test — envoie un event `webhook.test` signé
// à l'URL de l'abonnement et rend le résultat (`ok`, `status`, `error`).
// L'échec côté destinataire est une RÉPONSE (200, `ok:false`), pas une erreur.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery } from '../schemas';
import { sendWebhookTest } from '../service/integrations';

export default defineAdminRoute({
  key: 'admin-webhook-test',
  guard: { permission: 'manage_settings' },
  POST: mutate({
    query: IdQuery,
    // Appel sortant réel : serré, pour ne pas faire de nous un canon à requêtes.
    rateLimit: { max: 5, windowMs: 60_000 },
    // Chaque clic doit réellement envoyer : pas de rejeu depuis le cache.
    idempotent: false,
    audit: 'test_webhook',
    handler: ({ ctx, req }) => audited(ctx, sendWebhookTest(ctx, req.query.id)),
  }),
});
