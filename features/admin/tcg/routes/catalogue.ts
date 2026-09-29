// features/admin/tcg/routes/catalogue.ts — GET /api/admin/tcg/catalogue[?userId=]
// Catalogue de l'espace ; avec `userId`, la possession d'une joueuse
// RATTACHÉE à l'espace (revérifié : un sélecteur ne garde pas une route).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TcgCatalogueQuery } from '../schemas';
import { getCatalogue } from '../service/economy';

export default defineAdminRoute({
  key: 'tcg-catalogue',
  guard: { permission: 'manage_tcg' },
  GET: read({
    query: TcgCatalogueQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ query, ctx }) => getCatalogue(ctx, query.userId),
  }),
});
