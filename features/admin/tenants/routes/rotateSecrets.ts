// features/admin/tenants/routes/rotateSecrets.ts — /api/admin/tenants/[id]/rotate-secrets
//   POST   : rotation SANS coupure de la clé API + du secret webhook du bot ;
//            les valeurs en clair ne sortent QUE dans cette réponse.
//   DELETE : révocation immédiate de la clé précédente (fuite).
//
// Idempotence DÉSACTIVÉE : le cache d'idempotence stocke le corps de la
// réponse en base — la clé en clair n'y a rien à faire.
//
// Garde `manage_tenant` (portée tenant) + périmètre : l'espace de l'URL doit
// être un espace dont le staff est membre, ou pôle-admin (assertTenantInScope).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, RotateSecretsDoc } from '../schemas';
import { staffScope } from '../service/scope';
import {
  revokePreviousBotKey,
  rotateBotSecrets,
} from '../service/integrations';

const LIMIT = { max: 5, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenants-rotate-secrets',
  guard: { permission: 'manage_tenant' },
  POST: mutate({
    query: IdQuery,
    body: RotateSecretsDoc,
    rateLimit: LIMIT,
    idempotent: false,
    audit: 'rotate_bot_secrets',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        rotateBotSecrets(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
  DELETE: mutate({
    query: IdQuery,
    body: RotateSecretsDoc,
    rateLimit: LIMIT,
    idempotent: false,
    audit: 'revoke_previous_bot_key',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        revokePreviousBotKey(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
});
