// features/admin/events/routes/presence.ts — GET /api/admin/events/[runId]/presence
// Casters assignés aux matchs du run + statut de présence dérivé serveur.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { RunIdQuery } from '../schemas';
import { getRunPresence } from '../service/cues';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-presence',
  guard: EVENTS_GUARD,
  GET: read({
    query: RunIdQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => getRunPresence(ctx, query.runId),
  }),
});
