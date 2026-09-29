// features/admin/tournaments/routes/index.ts — /api/admin/tournaments
// GET : liste filtrée + pagination ; POST : création (pool de maps du jeu).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { TournamentCreateBody, TournamentListQuery } from '../schemas';
import { createTournament, listTournaments } from '../service/tournaments';

export default defineAdminRoute({
  key: 'admin-tournaments',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentListQuery,
    handler: ({ query, req, ctx }) =>
      listTournaments(ctx, query, parsePagination(req, { limit: 50 })),
  }),
  POST: mutate({
    body: TournamentCreateBody,
    status: 201,
    audit: 'create_tournament',
    handler: ({ body, ctx }) => audited(ctx, createTournament(ctx, body)),
  }),
});
