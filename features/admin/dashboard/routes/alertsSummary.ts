// features/admin/dashboard/routes/alertsSummary.ts
// GET /api/admin/alerts-summary[?tournament_id=] — badge « où ça brûle » de
// la barre admin, sans charger tout le dashboard.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { AlertsSummaryQuery } from '../schemas';
import { getAlertsSummary } from '../service';

export default defineAdminRoute({
  key: 'alerts-summary',
  // Présent pour tout le staff : gardé au rang le plus bas (lot A2), sinon
  // les rôles étroits reçoivent un 403 à chaque chargement de page.
  guard: 'helper',
  GET: read({
    query: AlertsSummaryQuery,
    // La barre sonde toutes les ~60 s : 30 s de cache navigateur suffisent.
    cache: 'private, max-age=30',
    handler: ({ query, ctx }) => getAlertsSummary(ctx, query.tournament_id),
  }),
});
