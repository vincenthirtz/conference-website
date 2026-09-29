// features/admin/stages/routes/generateGroupMatches.ts —
// POST /api/admin/stages/[stageId]/generate-group-matches : matchs round-robin
// de chaque poule (dry run possible).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageGroupMatchesBody, StageIdQuery } from '../schemas';
import { generateGroupMatches } from '../service/groups';

export default defineAdminRoute({
  key: 'stage-generate-group-matches',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageGroupMatchesBody,
    audit: 'generate_group_matches',
    handler: ({ query, body, ctx }) =>
      audited(ctx, generateGroupMatches(ctx, query.stageId, body)),
  }),
});
