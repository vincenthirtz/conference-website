// features/admin/events/routes/segmentsReorder.ts — POST /api/admin/events/[runId]/segments/reorder
// `{ orderedIds }` = TOUS les segments du run, une fois chacun.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ReorderSegmentsDoc, RunIdQuery } from '../schemas';
import { reorderSegments } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-reorder',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    body: ReorderSegmentsDoc,
    rateLimit: PER_MIN_30,
    audit: 'event_segment_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, reorderSegments(ctx, query.runId, body)),
  }),
});
