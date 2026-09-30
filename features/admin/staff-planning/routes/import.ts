// features/admin/staff-planning/routes/import.ts —
// /api/admin/staff-planning/import : POST le tableur « Calendrier
// disponibilité » déjà lu côté navigateur. Remplace l'import précédent des
// mois couverts ; les saisies manuelles restent.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPlanningImportBody } from '../schemas';
import { importPlanning } from '../service';

export default defineAdminRoute({
  key: 'staff-planning-import',
  guard: { permission: 'manage_staff' },
  POST: mutate({
    body: StaffPlanningImportBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    audit: 'import_staff_planning',
    handler: ({ body, ctx }) => audited(ctx, importPlanning(ctx, body)),
  }),
});
