// features/admin/tenants/routes/apiTokens.ts — /api/admin/api-tokens (espace ACTIF)
//   GET  : clés de l'espace actif (jamais le hash), créateur résolu.
//   POST : émission ; le clair n'est rendu qu'ici, une fois.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import {
  listActiveTenantApiTokens,
  mintApiToken,
} from '../service/integrations';
import { staffScope } from '../service/scope';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-api-tokens',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => listActiveTenantApiTokens(ctx),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    // Le clair ne doit jamais atterrir dans le cache d'idempotence.
    idempotent: false,
    // Journalisé par `mintTenantApiToken` (`create_api_token`).
    audit: false,
    handler: ({ ctx, req }) =>
      mintApiToken(staffScope(ctx.staff), ctx.tenantId, req.body),
  }),
});
