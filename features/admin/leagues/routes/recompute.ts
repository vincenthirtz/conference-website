// features/admin/leagues/routes/recompute.ts
// POST /api/admin/leagues/[id]/recompute — recalcule le classement à partir
// des final_rankings des tournois liés ET des scrims rattachés.
// → { standings_count }.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { LeagueSubRouteQuery } from '../schemas';
import { recomputeStandings } from '../service';

export default defineAdminRoute({
  key: 'leagues-recompute',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: LeagueSubRouteQuery,
    rateLimit: 'heavy',
    audit: 'recompute_league_standings',
    handler: async ({ query, ctx }) => {
      const result = await recomputeStandings(ctx, query.id);
      ctx.audit({
        entity_type: 'league',
        entity_id: query.id,
        payload: {
          operation: 'recompute_standings',
          standings_count: result.standingsCount,
          scrims_counted: result.scrimsCounted,
        },
      });
      return { standings_count: result.standingsCount };
    },
  }),
});
