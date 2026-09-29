// features/admin/ratings/routes/coverage.ts — GET /api/admin/ratings/coverage
// Couverture du rating joueur : matchs notés / non notés et pourquoi.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getRatingCoverage } from '../service';

export default defineAdminRoute({
  key: 'admin-ratings-coverage',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    rateLimit: { max: 30, windowMs: 60_000 },
    // Agrégat sur tous les matchs du tenant : 30 s de cache privé, comme avant.
    cache: 'private, max-age=30',
    handler: ({ ctx }) => getRatingCoverage(ctx),
  }),
});
