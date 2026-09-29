// features/admin/tenants/routes/staff.ts — /api/admin/tenants/[id]/staff
//   GET  : staff de l'espace (admin+ effectif ou rattaché).
//   POST : rattache un staff EXISTANT (owner effectif).
//
// Garde de rôle inchangée, PLUS le périmètre : l'espace de l'URL doit être
// un espace dont le staff est membre, ou pôle-admin (assertTenantInScope,
// 403 `TENANT_OUT_OF_SCOPE`).

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
