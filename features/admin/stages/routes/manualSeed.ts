// features/admin/stages/routes/manualSeed.ts — POST /api/admin/stages/[stageId]/manual-seed
// Placement explicite (matchId, slot, teamId) au round 1 d'un bracket.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageIdQuery, StageManualSeedBody } from '../schemas';
import { manualSeed } from '../service/seeding';

export default defineAdminRoute({
  key: 'stage-manual-seed',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageManualSeedBody,
    audit: 'auto_seed_bracket',
    handler: ({ query, body, ctx }) =>
      audited(ctx, manualSeed(ctx, query.stageId, body)),
  }),
});
