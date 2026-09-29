// features/admin/scrims/routes/plannings.ts — /api/admin/scrim-plannings
// GET : grilles de dispos (hors corbeille) ; POST : ouverture d'une grille.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { PlanningCreateLooseBody, PlanningListQuery } from '../schemas';
import { listPlannings, openPlanning } from '../service/plannings';

export default defineAdminRoute({
  key: 'admin-scrim-plannings',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: PlanningListQuery,
    handler: ({ query, ctx, req }) =>
      listPlannings(ctx, query, parsePagination(req, { limit: 50 })),
  }),
  POST: mutate({
    // Corps lu par le service : l'échec garde sa forme `{ error, field }`.
    body: PlanningCreateLooseBody,
    status: 201,
    audit: 'create_scrim_planning',
    handler: ({ body, ctx }) => audited(ctx, openPlanning(ctx, body)),
  }),
});
