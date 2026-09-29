// features/admin/tenants/routes/staffById.ts
// DELETE /api/admin/tenants/[id]/staff/[staffId] — retire un staff de
// l'espace ; jamais le dernier admin.
//
// Garde de rôle inchangée, PLUS le périmètre : l'espace de l'URL doit être
// un espace dont le staff est membre, ou pôle-admin (assertTenantInScope,
// 403 `TENANT_OUT_OF_SCOPE`).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TenantStaffIdQuery } from '../schemas';
import { removeTenantStaff } from '../service/members';
import { staffScope } from '../service/scope';

export default defineAdminRoute({
  key: 'admin-tenants-staff-delete',
  guard: { permission: 'manage_tenant' },
  DELETE: mutate({
    query: TenantStaffIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'revoke_tenant_staff',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        removeTenantStaff(
          ctx,
          staffScope(ctx.staff),
          req.query.id,
          req.query.staffId
        )
      ),
  }),
});
