// features/admin/ratings/routes/rebuild.ts — POST /api/admin/ratings/rebuild
// Rejoue tout le classement joueur du tenant. Geste lourd : 5/min.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { rebuildTenantRatings } from '../service';

export default defineAdminRoute({
  key: 'ratings-rebuild',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: 'rebuild_ratings',
    handler: ({ ctx }) => audited(ctx, rebuildTenantRatings(ctx)),
  }),
});
