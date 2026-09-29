// features/admin/tenants/routes/accessible.ts — GET /api/admin/tenants/accessible
// Liste des espaces du switcher de tenant ; tout le staff (caster+).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listTenantsForStaff } from '../service/access';

export default defineAdminRoute({
  key: 'tenants-accessible',
  guard: 'caster',
  GET: read({
    cache: 'no-store',
    handler: ({ ctx }) =>
      listTenantsForStaff(
        ctx.staff.staff.id,
        ctx.staff.staff.is_pole_admin === true
      ),
  }),
});
