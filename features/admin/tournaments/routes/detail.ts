// features/admin/tournaments/routes/detail.ts — /api/admin/tournament/[id]
// GET : fiche ; PATCH / PUT : modification (gardes de transition de statut).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TournamentDetailQuery, TournamentPatchBody } from '../schemas';
import { getTournament, patchTournament } from '../service/tournaments';

// PUT est un alias historique de PATCH (même corps, mêmes règles).
const update = mutate({
  query: TournamentDetailQuery,
  body: TournamentPatchBody,
  audit: 'tournament_update',
  handler: ({ query, body, ctx }) =>
    audited(ctx, patchTournament(ctx, query.id, body)),
});

export default defineAdminRoute({
  key: 'admin-tournament-id',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentDetailQuery,
    handler: ({ query, ctx }) => getTournament(ctx, query.id),
  }),
  PATCH: update,
  PUT: update,
});
