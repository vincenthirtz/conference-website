// features/admin/events/routes/runStart.ts — POST /api/admin/events/[runId]/start
// Passe le run de draft à live (déjà live : 200 sans journal ; done : 409).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { RunIdQuery } from '../schemas';
import { startRun } from '../service/runs';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-start',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_run_manage',
    handler: ({ query, ctx }) => audited(ctx, startRun(ctx, query.runId)),
  }),
});
