// features/admin/tournaments/routes/stats.ts — GET …/[id]/stats : vue d'ensemble, classement, maps, matchs serrés.
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdLowerQuery } from '../schemas';
import { tournamentStats } from '../service/stats';

export default defineAdminRoute({
  key: 'admin-tournament-stats',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdLowerQuery,
    handler: ({ query, ctx }) => tournamentStats(ctx, query.id),
  }),
});
