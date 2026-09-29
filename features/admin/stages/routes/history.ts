// features/admin/stages/routes/history.ts — GET /api/admin/stages/[stageId]/history
// Journal staff d'une phase : entrées rattachées à la phase + entrées d'autres
// entités qui la citent (`payload.stage_id`).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { StageHistoryQuery } from '../schemas';
import { stageHistory } from '../service/stage';

export default defineAdminRoute({
  key: 'stage-history',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageHistoryQuery,
    handler: ({ query, ctx }) => stageHistory(ctx, query.stageId, query),
  }),
});
