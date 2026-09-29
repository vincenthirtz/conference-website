// features/admin/tournaments/routes/history.ts — GET …/[id]/history
// Actions staff liées au tournoi (?entityType=, ?action=, ?limit= ≤ 1000).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { TournamentHistoryQuery } from '../schemas';
import { history } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-tournament-history',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentHistoryQuery,
    handler: ({ query, req, ctx }) =>
      history(ctx, query.id, query, parsePagination(req, { limit: 200 }).limit),
  }),
});
