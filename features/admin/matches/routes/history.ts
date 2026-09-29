// features/admin/matches/routes/history.ts — GET /api/admin/matches/[matchId]/history
// Actions staff liées au match (match, ses parties, ses déplacements).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { MatchIdQuery } from '../schemas';
import { getMatchHistory } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-match-history',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdQuery,
    handler: ({ query, ctx }) => getMatchHistory(ctx, query.matchId),
  }),
});
