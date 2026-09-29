// features/admin/dashboard/routes/networkFunnel.ts
// GET /api/admin/network-funnel — entonnoir du réseau joueuses (/admin/reseau).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getNetworkFunnel } from '../service/networkFunnel';

export default defineAdminRoute({
  key: 'admin-funnel',
  // Même permission que la page et que les journaux ; volumes agrégés,
  // aucune donnée nominative.
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    // En-tête historique, vérifié tel quel par les tests.
    cache: 'no-store',
    handler: ({ ctx }) => getNetworkFunnel(ctx),
  }),
});
