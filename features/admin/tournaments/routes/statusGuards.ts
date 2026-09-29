// features/admin/tournaments/routes/statusGuards.ts — GET …/[id]/status-guards
// Pour chaque statut : transition autorisée ou non, et pourquoi.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TournamentIdQuery } from '../schemas';
import { getStatusGuards } from '../service/tournaments';

export default defineAdminRoute({
  key: 'admin-tournament-status-guards',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => getStatusGuards(ctx, query.id),
  }),
});
