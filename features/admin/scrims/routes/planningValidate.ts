// features/admin/scrims/routes/planningValidate.ts
// POST /api/admin/scrim-plannings/[planningId]/validate — valide un créneau :
// matérialise (ou replanifie) le scrim, bascule la grille en 'validated'.
// Rejeu = scrim déjà créé renvoyé tel quel, sans nouveau journal.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PlanningIdQuery, PlanningValidateBody } from '../schemas';
import { validatePlanningSlot } from '../service/plannings';

export default defineAdminRoute({
  key: 'admin-scrim-plannings-validate',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    query: PlanningIdQuery,
    body: PlanningValidateBody,
    status: 201,
    audit: 'validate_scrim_planning',
    handler: ({ query, body, ctx }) =>
      audited(ctx, validatePlanningSlot(ctx, query.planningId, body)),
  }),
});
