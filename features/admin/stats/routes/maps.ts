// features/admin/stats/routes/maps.ts — GET /api/admin/stats/maps
// Statistiques par map, JSON ou CSV (`export=csv`).

import {
  defineAdminRoute,
  RESPONSE_SENT,
  read,
} from '@/utils/admin/defineAdminRoute';
import { MapStatsQuery } from '../schemas';
import { getMapStats, mapStatsCsv } from '../service';

export default defineAdminRoute({
  key: 'admin-stats-maps',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: MapStatsQuery,
    handler: async ({ query, ctx, res }) => {
      const page = await getMapStats(ctx, query);
      if (query.export === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="map-stats.csv"'
        );
        res.status(200).end(mapStatsCsv(page.stats));
        return RESPONSE_SENT;
      }
      return page;
    },
  }),
});
