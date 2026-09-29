// features/admin/leagues/routes/tournamentById.ts
// DELETE /api/admin/leagues/[id]/tournaments/[tournamentId] — délie un tournoi.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { LeagueTournamentQuery } from '../schemas';
import { unlinkTournament } from '../service';

export default defineAdminRoute({
  key: 'leagues-tournaments-unlink',
  guard: { permission: 'manage_tournaments' },
  DELETE: mutate({
    query: LeagueTournamentQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    status: 204,
    audit: 'unlink_league_tournament',
    handler: async ({ query, ctx }) => {
      await unlinkTournament(ctx, query.id, query.tournamentId);
      ctx.audit({
        entity_type: 'league',
        entity_id: query.id,
        payload: {
          operation: 'unlink_tournament',
          tournament_id: query.tournamentId,
        },
      });
    },
  }),
});
