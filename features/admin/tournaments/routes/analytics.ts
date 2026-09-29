// features/admin/tournaments/routes/analytics.ts — GET …/[id]/analytics : analytics agrégées (matchs, jeux, vetos, drafts), tier list et duels.
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdLowerQuery } from '../schemas';
import { analytics } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-tournament-analytics',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdLowerQuery,
    handler: ({ query, ctx }) => analytics(ctx, query.id),
  }),
});
