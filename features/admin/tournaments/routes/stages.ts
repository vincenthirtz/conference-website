// features/admin/tournaments/routes/stages.ts — …/[id]/stages
// GET : phases du tournoi ; POST : création ; PATCH : réordonnancement.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  StageCreateBody,
  StageReorderBody,
  TournamentIdQuery,
} from '../schemas';
import { createStage, listStages, reorderStages } from '../service/structure';

export default defineAdminRoute({
  key: 'admin-tournament-stages',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => listStages(ctx, query.id),
  }),
  POST: mutate({
    query: TournamentIdQuery,
    body: StageCreateBody,
    status: 201,
    audit: 'create_stage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createStage(ctx, query.id, body)),
  }),
  PATCH: mutate({
    query: TournamentIdQuery,
    body: StageReorderBody,
    audit: 'update_stage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, reorderStages(ctx, query.id, body)),
  }),
});
