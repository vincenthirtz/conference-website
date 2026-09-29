// features/admin/leagues/routes/tournaments.ts
// POST /api/admin/leagues/[id]/tournaments — lie un tournoi (poids optionnel).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { LeagueSubRouteQuery } from '../schemas';
import { linkTournament } from '../service';

export default defineAdminRoute({
  key: 'leagues-tournaments',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: LeagueSubRouteQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    status: 201,
    audit: 'link_league_tournament',
    handler: async ({ query, req, ctx }) => {
      const { link, tournamentId, weight } = await linkTournament(
        ctx,
        query.id,
        req.body
      );
      ctx.audit({
        entity_type: 'league',
        entity_id: query.id,
        payload: {
          operation: 'link_tournament',
          tournament_id: tournamentId,
          weight,
        },
      });
      return link;
    },
  }),
});
