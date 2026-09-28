// features/admin/users/routes/search.ts
// GET /api/admin/users/search?q= — joueuses par email ou BattleTag.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { UserSearchQuery } from '../schemas';
import { searchPlayers } from '../service';

export default defineAdminRoute({
  key: 'users-search',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_staff', scope: 'platform' },
  GET: read({
    query: UserSearchQuery,
    handler: ({ query, ctx }) => searchPlayers(ctx, query.q),
  }),
});
