// features/admin/stages/routes/autoSeed.ts — POST /api/admin/stages/[stageId]/auto-seed
// Round 1 d'un bracket peuplé depuis le classement d'une phase source.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageAutoSeedBody, StageIdQuery } from '../schemas';
import { autoSeed } from '../service/seeding';

export default defineAdminRoute({
  key: 'stage-auto-seed',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageAutoSeedBody,
    audit: 'auto_seed_bracket',
    handler: ({ query, body, ctx }) =>
      audited(ctx, autoSeed(ctx, query.stageId, body)),
  }),
});
