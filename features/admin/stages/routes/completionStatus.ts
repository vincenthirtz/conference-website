// features/admin/stages/routes/completionStatus.ts —
// GET /api/admin/stages/[stageId]/completion-status : achèvement de la phase et
// phase suivante suggérée. Lisible dès le rôle caster (régie).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { StageIdQuery } from '../schemas';
import { completionStatus } from '../service/stage';

export default defineAdminRoute({
  key: 'stage-completion-status',
  guard: 'caster',
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => completionStatus(ctx, query.stageId),
  }),
});
