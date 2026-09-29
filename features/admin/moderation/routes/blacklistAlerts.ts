// features/admin/moderation/routes/blacklistAlerts.ts
// GET /api/admin/moderation/blacklist/alerts — journal des alertes de détection
// (bot : scan / arrivée d'un membre ; site : inscription), curseur descendant.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { BlacklistAlertsQuery } from '../schemas';
import { listBlacklistAlerts } from '../service';

export default defineAdminRoute({
  key: 'admin-blacklist-alerts',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: BlacklistAlertsQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ query, ctx }) => listBlacklistAlerts(ctx, query),
  }),
});
