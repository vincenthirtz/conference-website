// features/admin/stages/routes/tiebreakerOverride.ts —
// /api/admin/stages/[stageId]/tiebreaker-override
// GET : overrides de départage ; POST : ajout ; DELETE : retrait (`{ id }`).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageIdQuery, TiebreakerOverrideBody } from '../schemas';
import {
  listOverrides,
  removeOverride,
  setOverride,
} from '../service/rollback';

export default defineAdminRoute({
  key: 'stage-tiebreaker-override',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => listOverrides(ctx, query.stageId),
  }),
  POST: mutate({
    query: StageIdQuery,
    body: TiebreakerOverrideBody,
    audit: 'set_tiebreaker_override',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(ctx, setOverride(ctx, query.stageId, body)),
  }),
  DELETE: mutate({
    query: StageIdQuery,
    body: TiebreakerOverrideBody,
    audit: 'remove_tiebreaker_override',
    handler: ({ query, body, ctx }) =>
      audited(ctx, removeOverride(ctx, query.stageId, body)),
  }),
});
