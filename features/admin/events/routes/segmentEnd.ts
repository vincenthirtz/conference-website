// features/admin/events/routes/segmentEnd.ts — POST /api/admin/events/[runId]/segments/[segId]/end
// Passe le segment de live à done (outbox event_segment.transitioned).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SegmentIdQuery } from '../schemas';
import { endSegment } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg-end',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: SegmentIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_segment_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, endSegment(ctx, query.runId, query.segId)),
  }),
});
