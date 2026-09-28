// features/admin/users/routes/search.ts
// GET /api/admin/users/search?q= — joueuses par email ou BattleTag.

import { z } from 'zod';
import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { searchPlayers } from '../service';

const Query = z.object({
  q: z
    .string({ error: 'Query must be at least 2 characters' })
    .trim()
    .min(2, { error: 'Query must be at least 2 characters' })
    .max(100, { error: 'Query too long (max 100 characters)' }),
});

export default defineAdminRoute({
  key: 'users-search',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_staff', scope: 'platform' },
  GET: read({
    query: Query,
    handler: ({ query, ctx }) => searchPlayers(ctx, query.q),
  }),
});
