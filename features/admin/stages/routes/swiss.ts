// features/admin/stages/routes/swiss.ts —
// GET /api/admin/stages/[stageId]/swiss : écran d'une phase suisse
// (classement enrichi, disqualifications comprises, et rondes). Lisible dès
// le rôle caster, comme swiss-status.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { StageIdQuery } from '../schemas';
import { swissOverview } from '../service/swissOverview';

export default defineAdminRoute({
  key: 'stage-swiss',
  guard: 'caster',
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => swissOverview(ctx, query.stageId),
  }),
});
