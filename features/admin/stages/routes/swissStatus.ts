// features/admin/stages/routes/swissStatus.ts —
// GET /api/admin/stages/[stageId]/swiss-status : progression d'une phase suisse
// (ronde courante, seuils, équipes sorties). Lisible dès le rôle caster.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { StageIdQuery } from '../schemas';
import { swissStatus } from '../service/swiss';

export default defineAdminRoute({
  key: 'stage-swiss-status',
  guard: 'caster',
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => swissStatus(ctx, query.stageId),
  }),
});
