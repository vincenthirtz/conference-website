// features/admin/matches/routes/analytics.ts — GET /api/admin/matches/[matchId]/analytics
// Vue analytique d'un match : parties, veto, drafts, score de cartes.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { MatchIdQuery } from '../schemas';
import { getMatchAnalytics } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-match-analytics',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdQuery,
    handler: ({ query, ctx }) => getMatchAnalytics(ctx, query.matchId),
  }),
});
