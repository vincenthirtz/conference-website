// features/admin/stages/routes/snapshots.ts — /api/admin/stages/[stageId]/snapshots
// GET : snapshots de bracket ; POST : snapshot manuel ; PATCH : restauration
// (admin et plus, en plus de la permission de la route).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SnapshotListQuery, StageIdQuery, StageSnapshotBody } from '../schemas';
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
} from '../service/rollback';

export default defineAdminRoute({
  key: 'stage-bracket-snapshots',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: SnapshotListQuery,
    handler: ({ query, ctx }) => listSnapshots(ctx, query.stageId, query.limit),
  }),
  POST: mutate({
    query: StageIdQuery,
    body: StageSnapshotBody,
    audit: 'create_bracket_snapshot',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(ctx, createSnapshot(ctx, query.stageId, body)),
  }),
  PATCH: mutate({
    query: StageIdQuery,
    body: StageSnapshotBody,
    audit: 'restore_bracket_snapshot',
    handler: ({ query, body, ctx }) =>
      audited(ctx, restoreSnapshot(ctx, query.stageId, ctx.staff.role, body)),
  }),
});
