// features/admin/events/routes/segmentById.ts — /api/admin/events/[runId]/segments/[segId]
// GET : fiche ; PATCH/PUT : édition (ni statut ni ord : /start…, /reorder) ;
// DELETE : suppression hard.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SegmentIdQuery, UpdateSegmentDoc } from '../schemas';
import { deleteSegment, getSegment, updateSegment } from '../service/segments';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

const update = mutate({
  query: SegmentIdQuery,
  body: UpdateSegmentDoc,
  rateLimit: PER_MIN_60,
  audit: 'event_segment_manage',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateSegment(ctx, query.runId, query.segId, body)),
});

export default defineAdminRoute({
  key: 'admin-events-seg-id',
  guard: EVENTS_GUARD,
  GET: read({
    query: SegmentIdQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => getSegment(ctx, query.runId, query.segId),
  }),
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: SegmentIdQuery,
    rateLimit: PER_MIN_60,
    audit: 'event_segment_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteSegment(ctx, query.runId, query.segId)),
  }),
});
