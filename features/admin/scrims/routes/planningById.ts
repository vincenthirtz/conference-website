// features/admin/scrims/routes/planningById.ts
// /api/admin/scrim-plannings/[planningId] — fiche (dispos + heatmap complète),
// modification des champs autorisés (PATCH / PUT), corbeille (DELETE).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PlanningIdQuery, PlanningPatchBody } from '../schemas';
import {
  deletePlanning,
  getPlanningDetail,
  updatePlanning,
} from '../service/plannings';

const update = mutate({
  query: PlanningIdQuery,
  body: PlanningPatchBody,
  audit: 'update_scrim_planning',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updatePlanning(ctx, query.planningId, body)),
});

export default defineAdminRoute({
  key: 'admin-scrim-planning-id',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: PlanningIdQuery,
    handler: ({ query, ctx }) => getPlanningDetail(ctx, query.planningId),
  }),
  // PUT est un alias historique de PATCH.
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: PlanningIdQuery,
    audit: 'delete_scrim_planning',
    handler: ({ query, ctx }) =>
      audited(ctx, deletePlanning(ctx, query.planningId)),
  }),
});
