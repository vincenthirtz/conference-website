// features/admin/scrims/routes/planningConflicts.ts
// POST /api/admin/scrim-plannings/[planningId]/conflicts — PRÉVISUALISATION des
// conflits de créneau avant validation. Lecture seule : ni journal, ni
// idempotence (le résultat dépend de l'état du moment).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { PlanningConflictsLooseBody, PlanningIdQuery } from '../schemas';
import { previewPlanningConflicts } from '../service/plannings';

export default defineAdminRoute({
  key: 'admin-scrim-planning-conflicts',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    query: PlanningIdQuery,
    // Corps lu par le service : tout échec rend « Requête invalide. ».
    body: PlanningConflictsLooseBody,
    audit: false,
    idempotent: false,
    handler: ({ query, body, ctx }) =>
      previewPlanningConflicts(ctx, query.planningId, body),
  }),
});
