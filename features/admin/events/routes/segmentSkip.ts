// features/admin/events/routes/segmentSkip.ts — POST /api/admin/events/[runId]/segments/[segId]/skip
// Passe le segment de upcoming à skipped (outbox event_segment.transitioned).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SegmentIdQuery } from '../schemas';
import { skipSegment } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg-skip',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: SegmentIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_segment_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, skipSegment(ctx, query.runId, query.segId)),
  }),
});
