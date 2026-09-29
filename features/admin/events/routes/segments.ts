// features/admin/events/routes/segments.ts — POST /api/admin/events/[runId]/segments
// Crée un segment ; `ord` absent = queue (MAX+1), `ord` pris = 409.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateSegmentDoc, RunIdQuery } from '../schemas';
import { createSegment } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    body: CreateSegmentDoc,
    rateLimit: PER_MIN_60,
    status: 201,
    audit: 'event_segment_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createSegment(ctx, query.runId, body)),
  }),
});
