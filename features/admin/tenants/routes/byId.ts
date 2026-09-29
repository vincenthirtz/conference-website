// features/admin/tenants/routes/byId.ts — /api/admin/tenants/[id]
//   GET    : fiche (admin+ effectif, ou staff rattaché à CET espace).
//   PATCH  : nom, langue, activité, réseau, marque blanche (owner) ; slug immuable.
//   DELETE : désactivation soft (owner) ; `conference` protégé.
// Garde d'entrée `caster`, contrôles fins dans le service (à l'identique).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, TenantPatchDoc } from '../schemas';
import { staffScope } from '../service/scope';
import {
  deactivateTenant,
  getTenantDetail,
  updateTenant,
} from '../service/tenants';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenants-mutate',
  guard: 'caster',
  GET: read({
    query: IdQuery,
    rateLimit: LIMIT,
    handler: ({ ctx, req }) =>
      getTenantDetail(ctx, staffScope(ctx.staff), req.query.id),
  }),
  PATCH: mutate({
    query: IdQuery,
    body: TenantPatchDoc,
    rateLimit: LIMIT,
    audit: 'update_tenant',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        updateTenant(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
  DELETE: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    audit: 'deactivate_tenant',
    handler: ({ ctx, req }) =>
      audited(ctx, deactivateTenant(ctx, staffScope(ctx.staff), req.query.id)),
  }),
});
