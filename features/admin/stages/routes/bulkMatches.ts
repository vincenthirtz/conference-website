// features/admin/stages/routes/bulkMatches.ts — /api/admin/stages/[stageId]/bulk-matches
// PATCH : planification en masse ; PUT : édition en masse ; DELETE : annulation
// ou suppression ; POST : annulation (undo) d'une de ces opérations.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageBulkMatchesBody, StageIdQuery } from '../schemas';
import {
  bulkDelete,
  bulkSchedule,
  bulkUndo,
  bulkUpdate,
} from '../service/matchOps';

export default defineAdminRoute({
  key: 'stage-bulk-matches',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageBulkMatchesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, bulkUndo(ctx, query.stageId, body)),
  }),
  PATCH: mutate({
    query: StageIdQuery,
    body: StageBulkMatchesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, bulkSchedule(ctx, query.stageId, body)),
  }),
  PUT: mutate({
    query: StageIdQuery,
    body: StageBulkMatchesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, bulkUpdate(ctx, query.stageId, body)),
  }),
  DELETE: mutate({
    query: StageIdQuery,
    body: StageBulkMatchesBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, bulkDelete(ctx, query.stageId, body)),
  }),
});
