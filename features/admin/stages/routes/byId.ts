// features/admin/stages/routes/byId.ts — /api/admin/stages/[stageId]
// GET : fiche ; PUT / PATCH : modification ; DELETE : désactivation
// (`?hard=1|true` : suppression définitive).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageDeleteQuery, StageIdQuery, StageUpdateBody } from '../schemas';
import { deleteStage, getStage, updateStage } from '../service/stage';

const update = mutate({
  query: StageIdQuery,
  body: StageUpdateBody,
  audit: 'update_stage',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateStage(ctx, query.stageId, body)),
});

export default defineAdminRoute({
  key: 'admin-stage-id',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => getStage(ctx, query.stageId),
  }),
  // PUT et PATCH : mêmes règles (mise à jour partielle).
  PUT: update,
  PATCH: update,
  DELETE: mutate({
    query: StageDeleteQuery,
    // Suppression définitive ; la désactivation se journalise `update_stage`.
    audit: 'delete_stage',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteStage(ctx, query.stageId, query.hard)),
  }),
});
