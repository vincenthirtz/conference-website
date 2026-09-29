// features/admin/tcg/routes/engagement.ts — GET /api/admin/tcg/engagement[?weeks=8]
// Qui a un paquet qui dort, et la tendance hebdomadaire (nominatif).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TcgEngagementQuery } from '../schemas';
import { getEngagement } from '../service/economy';

export default defineAdminRoute({
  key: 'tcg-engagement',
  guard: { permission: 'manage_tcg' },
  GET: read({
    query: TcgEngagementQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ query, ctx }) => getEngagement(ctx, query.weeks),
  }),
});
