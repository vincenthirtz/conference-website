// features/admin/stats/routes/teams.ts — GET /api/admin/stats/teams
// Statistiques par équipe (tournois du tenant), JSON ou CSV (`export=csv`).

import {
  defineAdminRoute,
  RESPONSE_SENT,
  read,
} from '@/utils/admin/defineAdminRoute';
import { TeamStatsQuery } from '../schemas';
import { getTeamStats, teamStatsCsv } from '../service';

export default defineAdminRoute({
  key: 'admin-stats-teams',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TeamStatsQuery,
    handler: async ({ query, ctx, res }) => {
      const { page, csv } = await getTeamStats(ctx, query);
      if (csv && query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="team-stats.csv"'
        );
        res.status(200).end(teamStatsCsv(page.stats));
        return RESPONSE_SENT;
      }
      return page;
    },
  }),
});
