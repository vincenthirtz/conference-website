// features/admin/tournaments/routes/clone.ts — POST …/[id]/clone
// Duplique la structure (phases, pool de maps, réglages), sans équipes ni
// résultats.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CloneTournamentBody, TournamentIdQuery } from '../schemas';
import { cloneTournament } from '../service/structure';

export default defineAdminRoute({
  key: 'tournament-clone',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdQuery,
    body: CloneTournamentBody,
    status: 201,
    audit: 'create_tournament',
    handler: ({ query, body, ctx }) =>
      audited(ctx, cloneTournament(ctx, query.id, body)),
  }),
});
