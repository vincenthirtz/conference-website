// features/admin/logs/routes/entityHistory.ts
// GET /api/admin/entity-history?type=&id= — « Qui a touché à ça, et quand ? »
// pour une équipe, un tournoi, un compte, un ticket, un run, un espace…
// (la route match, plus riche, reste /api/admin/matches/[matchId]/history).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { EntityHistoryQuery } from '../schemas';
import { readEntityHistory } from '../service';

export default defineAdminRoute({
  key: 'entity-history',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: EntityHistoryQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ query, ctx }) => readEntityHistory(ctx, ctx.staff, query),
  }),
});
