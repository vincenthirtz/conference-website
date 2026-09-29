// features/admin/dashboard/routes/overviewSummary.ts
// GET /api/admin/overview-summary — KPI globaux du hub (/admin) en une requête
// (six comptes count-only, `null` = inconnu).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getOverviewSummary } from '../service/hub';

export default defineAdminRoute({
  key: 'admin-overview-summary',
  // Agrégat TRANSVERSE (tournois, équipes, demandes, support, litiges) :
  // aucune permission unique ne le décrit, il reste gardé par rôle.
  guard: 'admin',
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: 'private, max-age=30',
    handler: ({ ctx }) => getOverviewSummary(ctx),
  }),
});
