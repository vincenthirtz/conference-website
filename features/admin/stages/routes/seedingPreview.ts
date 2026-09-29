// features/admin/stages/routes/seedingPreview.ts —
// GET /api/admin/stages/[stageId]/seeding-preview : seeding proposé depuis une
// phase source, état actuel du round 1, verrou et équipes non placées.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { SeedingPreviewQuery } from '../schemas';
import { seedingPreview } from '../service/seeding';

export default defineAdminRoute({
  key: 'stage-seeding-preview',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: SeedingPreviewQuery,
    handler: ({ query, ctx }) => seedingPreview(ctx, query.stageId, query),
  }),
});
