// features/admin/leagues/routes/standings.ts
// GET /api/admin/leagues/[id]/standings — classement + tournois liés, sans
// filtre is_public/draft (une ligue en préparation reste consultable).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { LeagueSubRouteQuery } from '../schemas';
import { getStandings } from '../service';

export default defineAdminRoute({
  key: 'leagues-standings',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: LeagueSubRouteQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ query, ctx }) => getStandings(ctx, query.id),
  }),
});
