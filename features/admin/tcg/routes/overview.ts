// features/admin/tcg/routes/overview.ts — GET /api/admin/tcg/overview[?top=]
// L'état de l'économie du TCG en un appel, agrégé côté serveur.
//
// La query (`?top=`) est validée par le SERVICE avec le schéma documenté
// (`x-zod-query: admin.tcg/overview.query`), pour garder le 400 historique
// `INVALID_QUERY` + message `formatZodError`.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getOverview } from '../service/overview';

export default defineAdminRoute({
  key: 'tcg-overview',
  guard: { permission: 'manage_tcg' },
  GET: read({
    // Plus bas que la file de modération : cet agrégat lit davantage.
    rateLimit: { max: 30, windowMs: 60_000 },
    // 30 s : un aller-retour entre onglets, pas plus.
    cache: 'private, max-age=30',
    handler: ({ req, ctx }) => getOverview(ctx, req.query),
  }),
});
