// features/admin/tenants/routes/activeTenant.ts — /api/admin/active-tenant
//   GET  : espace actif du staff (cookie + repli).
//   POST : bascule d'espace (cookie `staff_active_tenant_id`), si le staff y
//          a accès — sinon 403 `NO_ACCESS_TO_TENANT`.
// `caster` : tout staff doit pouvoir connaître / changer son espace actif.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { buildActiveTenantSetCookie } from '@/utils/adminTenants';
import { ActiveTenantDoc } from '../schemas';
import { staffScope } from '../service/scope';
import { getActiveTenant, switchActiveTenant } from '../service/tenants';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'active-tenant',
  guard: 'caster',
  GET: read({
    rateLimit: LIMIT,
    cache: 'no-store',
    handler: ({ ctx }) => getActiveTenant(ctx, ctx.staff.currentTenantSource),
  }),
  POST: mutate({
    body: ActiveTenantDoc,
    rateLimit: LIMIT,
    cache: 'no-store',
    // La réponse pose un cookie : un rejeu depuis le cache ne le poserait pas.
    idempotent: false,
    // Préférence de session, pas un geste d'administration (jamais journalisé).
    audit: false,
    handler: async ({ ctx, req, res }) => {
      const { tenantId, tenant } = await switchActiveTenant(
        ctx,
        staffScope(ctx.staff),
        req.body
      );
      res.setHeader('Set-Cookie', buildActiveTenantSetCookie(tenantId));
      return { tenant };
    },
  }),
});
