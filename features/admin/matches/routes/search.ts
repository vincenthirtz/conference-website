// features/admin/matches/routes/search.ts — GET /api/admin/matches/search
// Recherche floue de matchs du tenant (`q`, `upcoming`, `limit`) pour les
// sélecteurs staff (Director / run-of-show).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { MatchSearchQuery } from '../schemas';
import { searchAdminMatches } from '../service/insights';

export type { AdminMatchSearchResult } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-match-search',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchSearchQuery,
    handler: ({ query, ctx }) => searchAdminMatches(ctx, query),
  }),
});
