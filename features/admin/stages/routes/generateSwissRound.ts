// features/admin/stages/routes/generateSwissRound.ts —
// POST /api/admin/stages/[stageId]/generate-swiss-round : ronde suisse suivante
// (dry run possible ; rematches seulement sur confirmation explicite).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageIdQuery, StageSwissRoundBody } from '../schemas';
import { generateSwissRound } from '../service/swiss';

export default defineAdminRoute({
  key: 'stage-generate-swiss-round',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: StageIdQuery,
    body: StageSwissRoundBody,
    audit: 'create_swiss_round',
    handler: ({ query, body, ctx }) =>
      audited(ctx, generateSwissRound(ctx, query.stageId, body)),
  }),
});
