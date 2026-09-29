// features/admin/matches/routes/castAssignmentById.ts — /api/admin/matches/[matchId]/cast-assignments/[assignmentId]
// PATCH : reprogramme le briefing ; DELETE : retire le caster.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  MatchCastAssignmentIdQuery,
  MatchCastAssignmentPatchBody,
} from '../schemas';
import {
  rescheduleCastAssignment,
  unassignCaster,
} from '../service/castAssignments';

export default defineAdminRoute({
  key: 'admin-match-cast-assignment',
  guard: { permission: 'arbitrate_matches' },
  PATCH: mutate({
    query: MatchCastAssignmentIdQuery,
    body: MatchCastAssignmentPatchBody,
    // Aucun journal staff à l'origine (l'événement bot trace le geste).
    audit: false,
    handler: ({ query, body, ctx }) =>
      rescheduleCastAssignment(ctx, query.matchId, query.assignmentId, body),
  }),
  DELETE: mutate({
    query: MatchCastAssignmentIdQuery,
    audit: 'delete_cast_assignment',
    handler: ({ query, ctx }) =>
      audited(ctx, unassignCaster(ctx, query.matchId, query.assignmentId)),
  }),
});
