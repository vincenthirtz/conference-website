// features/admin/leagues/routes/byId.ts
// /api/admin/leagues/[id] — GET détail, PATCH mise à jour partielle, DELETE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { LeagueIdQuery } from '../schemas';
import { deleteLeague, getLeague, updateLeague } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'leagues-id',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: LeagueIdQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getLeague(ctx, query.id),
  }),
  PATCH: mutate({
    query: LeagueIdQuery,
    rateLimit: LIMIT,
    audit: 'update_league',
    handler: async ({ query, req, ctx }) => {
      const { row, fields } = await updateLeague(ctx, query.id, req.body);
      ctx.audit({
        entity_type: 'league',
        entity_id: query.id,
        payload: { operation: 'update_league', fields },
      });
      return row;
    },
  }),
  DELETE: mutate({
    query: LeagueIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'delete_league',
    handler: async ({ query, ctx }) => {
      await deleteLeague(ctx, query.id);
      ctx.audit({
        entity_type: 'league',
        entity_id: query.id,
        payload: { operation: 'delete_league' },
      });
    },
  }),
});
