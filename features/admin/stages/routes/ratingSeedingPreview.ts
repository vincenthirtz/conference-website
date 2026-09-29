// features/admin/stages/routes/ratingSeedingPreview.ts —
// GET /api/admin/stages/[stageId]/rating-seeding-preview : seeding proposé
// depuis les ratings (+ force du calendrier), sans écriture.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { RatingSeedingPreviewQuery } from '../schemas';
import { ratingSeedingPreview } from '../service/seeding';

export default defineAdminRoute({
  key: 'stage-rating-seeding-preview',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: RatingSeedingPreviewQuery,
    handler: ({ query, ctx }) =>
      ratingSeedingPreview(ctx, query.stageId, query),
  }),
});
