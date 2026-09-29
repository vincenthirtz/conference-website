// features/admin/tenants/routes/apiTokenById.ts — /api/admin/api-tokens/[id]
//   PATCH  : exemption partenaire (`comp = true` réservé à l'owner).
//   DELETE : révocation soft, idempotente.
// Toujours scopé à l'espace ACTIF.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ApiTokenPatchDoc, IdQuery } from '../schemas';
import {
  patchActiveTenantApiToken,
  revokeActiveTenantApiToken,
} from '../service/integrations';
import { staffScope } from '../service/scope';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-api-tokens-id',
  guard: { permission: 'manage_settings' },
  PATCH: mutate({
    query: IdQuery,
    body: ApiTokenPatchDoc,
    rateLimit: LIMIT,
    audit: 'update_api_token_comp',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        patchActiveTenantApiToken(
          ctx,
          staffScope(ctx.staff),
          req.query.id,
          req.body
        )
      ),
  }),
  DELETE: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    audit: 'revoke_api_token',
    handler: ({ ctx, req }) =>
      audited(ctx, revokeActiveTenantApiToken(ctx, req.query.id)),
  }),
});
