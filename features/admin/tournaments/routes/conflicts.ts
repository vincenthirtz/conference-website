// features/admin/tournaments/routes/conflicts.ts — GET …/[id]/conflicts : équipes engagées sur deux matchs qui se chevauchent.
// Lecture seule.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdQuery } from '../schemas';
import { conflicts } from '../service/schedule';

export default defineAdminRoute({
  key: 'admin-tournament-conflicts',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => conflicts(ctx, query.id),
  }),
});
