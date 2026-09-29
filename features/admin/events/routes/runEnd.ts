// features/admin/events/routes/runEnd.ts — POST /api/admin/events/[runId]/end
// Passe le run de live à done et clôt ses segments (déjà done : 200 ; draft : 409).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { RunIdQuery } from '../schemas';
import { endRun } from '../service/runs';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-end',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_run_manage',
    handler: ({ query, ctx }) => audited(ctx, endRun(ctx, query.runId)),
  }),
});
