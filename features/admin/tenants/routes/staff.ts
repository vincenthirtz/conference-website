// features/admin/tenants/routes/staff.ts — /api/admin/tenants/[id]/staff
//   GET  : staff de l'espace (admin+ effectif ou rattaché).
//   POST : rattache un staff EXISTANT (owner effectif).
//
// Garde CONSERVÉE à l'identique (`caster` + owner EFFECTIF, id libre) — cf.
// rapport de migration : un propriétaire d'espace peut se rattacher à un
// AUTRE espace.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, TenantStaffAddDoc } from '../schemas';
import { addTenantStaff, listTenantStaff } from '../service/members';
import { staffScope } from '../service/scope';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenants-staff-add',
  guard: 'caster',
  GET: read({
    query: IdQuery,
    rateLimit: LIMIT,
    handler: ({ ctx, req }) =>
      listTenantStaff(ctx, staffScope(ctx.staff), req.query.id),
  }),
  POST: mutate({
    query: IdQuery,
    body: TenantStaffAddDoc,
    rateLimit: LIMIT,
    audit: 'grant_tenant_staff',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        addTenantStaff(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
});
