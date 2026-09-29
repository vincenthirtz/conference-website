// features/admin/tournaments/routes/dashboard.ts — GET …/[id]/dashboard
// Payload du hub (KPIs, signaux, gardes, vélocité, activité staff) ; calcul
// dans utils/dashboard/buildTournamentDashboard.ts.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { DashboardQuery } from '../schemas';
import { dashboard } from '../service/insights';

export default defineAdminRoute({
  key: 'admin-tournament-dashboard',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: DashboardQuery,
    // 30 s + stale-while-revalidate 60 s pour les gros tournois.
    cache: 'private, max-age=30, stale-while-revalidate=60',
    handler: ({ query, ctx }) => dashboard(ctx, query.id),
  }),
});
