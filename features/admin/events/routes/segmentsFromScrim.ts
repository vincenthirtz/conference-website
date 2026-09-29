// features/admin/events/routes/segmentsFromScrim.ts — POST /api/admin/events/[runId]/segments/from-scrim
// Un segment `match` par match de un scrim, à la queue du run, sans doublon.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { FromScrimDoc, RunIdQuery } from '../schemas';
import { prefillFromScrim } from '../service/prefill';
import { EVENTS_GUARD, PER_MIN_20 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg-from-scrim',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    body: FromScrimDoc,
    rateLimit: PER_MIN_20,
    audit: 'event_segment_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, prefillFromScrim(ctx, query.runId, body)),
  }),
});
