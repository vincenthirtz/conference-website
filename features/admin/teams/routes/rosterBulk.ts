// features/admin/teams/routes/rosterBulk.ts — POST /api/admin/teams/[teamId]/roster-bulk
// Une opération roster sur plusieurs membres, un résultat par membre.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamIdQuery, TeamRosterBulkBody } from '../schemas';
import { rosterBulk } from '../service/rosterBulk';

export default defineAdminRoute({
  key: 'admin-team-roster-bulk',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    query: TeamIdQuery,
    body: TeamRosterBulkBody,
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: 'bulk_roster_update',
    handler: ({ query, body, ctx }) =>
      audited(ctx, rosterBulk(ctx, query.teamId, body)),
  }),
});
