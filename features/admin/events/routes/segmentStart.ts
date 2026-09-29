// features/admin/events/routes/segmentStart.ts — POST /api/admin/events/[runId]/segments/[segId]/start
// Passe le segment de upcoming à live (un seul live par run, outbox event_segment.transitioned).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SegmentIdQuery } from '../schemas';
import { startSegment } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg-start',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: SegmentIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_segment_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, startSegment(ctx, query.runId, query.segId)),
  }),
});
