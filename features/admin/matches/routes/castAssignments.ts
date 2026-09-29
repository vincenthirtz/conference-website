// features/admin/matches/routes/castAssignments.ts — /api/admin/matches/[matchId]/cast-assignments
// GET : casters du match ; POST : assigne `{ castMemberId, briefingAt }`.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MatchCastAssignmentBody, MatchIdFrQuery } from '../schemas';
import { assignCaster, listCastAssignments } from '../service/castAssignments';

export default defineAdminRoute({
  key: 'admin-match-cast-assignments',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdFrQuery,
    handler: ({ query, ctx }) => listCastAssignments(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchIdFrQuery,
    body: MatchCastAssignmentBody,
    status: 201,
    audit: 'create_cast_assignment',
    handler: ({ query, body, ctx }) =>
      audited(ctx, assignCaster(ctx, query.matchId, body)),
  }),
});
