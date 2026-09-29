// features/admin/scrims/routes/castAssignments.ts
// /api/admin/scrims/[scrimId]/cast-assignments — casters d'un scrim
// (parité avec matches/[matchId]/cast-assignments).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ScrimCastAssignmentBody, ScrimIdQuery } from '../schemas';
import {
  assignScrimCaster,
  listScrimCastAssignments,
} from '../service/scrimMatches';

export default defineAdminRoute({
  key: 'admin-scrim-cast-assignments',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: ScrimIdQuery,
    handler: ({ query, ctx }) => listScrimCastAssignments(ctx, query.scrimId),
  }),
  POST: mutate({
    query: ScrimIdQuery,
    body: ScrimCastAssignmentBody,
    status: 201,
    audit: 'create_cast_assignment',
    handler: ({ query, body, ctx }) =>
      audited(ctx, assignScrimCaster(ctx, query.scrimId, body)),
  }),
});
