// features/admin/tenants/routes/tenantApiTokens.ts — /api/admin/tenants/[id]/api-tokens
//   GET    : clés d'un espace NOMMÉ (jamais le hash).
//   POST   : émission pour CET espace ; le clair n'est rendu qu'ici.
//   DELETE : révocation soft (`?tokenId=`), idempotente.
// Owner de la PLATEFORME (`manage_tenant` + `scope: 'platform'`) PUIS owner
// effectif — contrôles d'origine, dans cet ordre.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, TenantApiTokensQuery } from '../schemas';
import {
  listNamedTenantApiTokens,
  mintApiToken,
  revokeNamedTenantApiToken,
} from '../service/integrations';
import {
  assertOwner,
  assertTenantInScope,
  requireUuid,
  staffScope,
} from '../service/scope';
import type { AdminRouteContext } from '@/utils/admin/defineAdminRoute';

const LIMIT = { max: 20, windowMs: 60_000 };

async function ownerTenant(ctx: AdminRouteContext, rawId: unknown) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  const scope = staffScope(ctx.staff);
  assertOwner(scope);
  // Membre de CET espace ou pôle-admin, avant toute lecture.
  await assertTenantInScope(scope, id);
  return { id, scope };
}

export default defineAdminRoute({
  key: 'admin-tenant-api-tokens',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    query: IdQuery,
    rateLimit: LIMIT,
    handler: async ({ ctx, req }) =>
      listNamedTenantApiTokens(ctx, (await ownerTenant(ctx, req.query.id)).id),
  }),
  POST: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    status: 201,
    // Le clair ne doit jamais atterrir dans le cache d'idempotence.
    idempotent: false,
    // Journalisé par `mintTenantApiToken` (`create_api_token`, espace de la CLÉ).
    audit: false,
    handler: async ({ ctx, req }) => {
      const { id, scope } = await ownerTenant(ctx, req.query.id);
      return mintApiToken(scope, id, req.body);
    },
  }),
  DELETE: mutate({
    query: TenantApiTokensQuery,
    rateLimit: LIMIT,
    audit: 'revoke_api_token',
    handler: async ({ ctx, req }) => {
      const { id } = await ownerTenant(ctx, req.query.id);
      return audited(
        ctx,
        revokeNamedTenantApiToken(ctx, id, req.query.tokenId)
      );
    },
  }),
});
