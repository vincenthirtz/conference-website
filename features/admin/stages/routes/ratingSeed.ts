// features/admin/stages/routes/ratingSeed.ts — POST /api/admin/stages/[stageId]/rating-seed
// Application du seeding par ratings (même calcul que la prévisualisation).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { RatingSeedBody, StageIdQuery } from '../schemas';
import { ratingSeed } from '../service/seeding';

export default defineAdminRoute({
  key: 'stage-rating-seed',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: RatingSeedBody,
    audit: 'auto_seed_bracket',
    handler: ({ query, body, ctx }) =>
      audited(ctx, ratingSeed(ctx, query.stageId, body)),
  }),
});
