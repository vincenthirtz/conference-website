// features/admin/free-players/routes.ts — GET liste, DELETE `?id=`.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { RemoveFreePlayerQuery } from './schemas';
import { listFreePlayers, removeFreePlayer } from './service';

export default defineAdminRoute({
  key: 'free-players',
  guard: { permission: 'manage_teams' },
  // 60/min comme avant la migration : la liste est rechargée après chaque
  // retrait, le préréglage `read` n'apporterait rien.
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => listFreePlayers(ctx),
  }),
  DELETE: mutate({
    query: RemoveFreePlayerQuery,
    audit: 'delete_free_player',
    handler: async ({ query, ctx }) => {
      const { removed, ...result } = await removeFreePlayer(ctx, query.id);
      ctx.audit({
        entity_type: 'free_player',
        entity_id: query.id,
        payload: removed,
      });
      return result;
    },
  }),
});
