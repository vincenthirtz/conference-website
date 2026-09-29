// features/admin/dashboard/routes/search.ts
// GET /api/admin/search?q= — recherche transverse (palette de commandes) :
// équipes, tournois, matchs, tickets, tâches — filtrés par permission.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { AdminSearchQuery } from '../schemas';
import { searchAdmin } from '../service/hub';

export default defineAdminRoute({
  key: 'admin-search',
  // « Être du staff » : aucune section n'est renvoyée sans sa permission, et
  // la palette reste ouvrable par tous, chacun n'y voyant que ce qu'il ouvre.
  guard: 'helper',
  GET: read({
    query: AdminSearchQuery,
    handler: ({ query, ctx }) => searchAdmin(ctx, ctx.staff.role, query.q),
  }),
});
