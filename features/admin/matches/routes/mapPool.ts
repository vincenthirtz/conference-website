// features/admin/matches/routes/mapPool.ts — GET /api/admin/matches/[matchId]/map-pool
// Pool de cartes jouables pour ce match (suggestions de l'écran d'arbitrage).
// Même permission que la saisie des parties.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { MatchIdFrQuery } from '../schemas';
import { getMatchMapPool } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-match-map-pool',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdFrQuery,
    handler: ({ query, ctx }) => getMatchMapPool(ctx, query.matchId),
  }),
});
