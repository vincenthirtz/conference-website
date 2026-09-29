// features/admin/leagues/routes/index.ts
// /api/admin/leagues — GET liste des ligues du tenant, POST création (slug
// unique par tenant, limite du plan).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { createLeague, listLeagues } from '../service';

// 60/min comme avant la migration (un seul seau GET + POST à l'époque).
const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'leagues',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => listLeagues(ctx),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    status: 201,
    audit: 'create_league',
    handler: async ({ req, ctx }) => {
      const league = await createLeague(ctx, req.body);
      ctx.audit({
        entity_type: 'league',
        entity_id: league.id,
        payload: { operation: 'create_league', slug: league.slug },
      });
      return league;
    },
  }),
});
