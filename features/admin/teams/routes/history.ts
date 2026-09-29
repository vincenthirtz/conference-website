// features/admin/teams/routes/history.ts — GET /api/admin/teams/[teamId]/history
// Journal staff lié à l'équipe (filtres `entityType`, `action`, `limit`).

import { parsePagination } from '@/utils/apiHelpers';
import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TeamHistoryQuery } from '../schemas';
import { getTeamHistory } from '../service/history';

export default defineAdminRoute({
  key: 'admin-team-history',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamHistoryQuery,
    handler: ({ query, ctx, req }) =>
      getTeamHistory(
        ctx,
        query.teamId,
        { entityType: query.entityType, action: query.action },
        parsePagination(req, { limit: 200 }).limit
      ),
  }),
});
