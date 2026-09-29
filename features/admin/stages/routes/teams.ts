// features/admin/stages/routes/teams.ts — /api/admin/stages/[stageId]/teams
// GET : équipes inscrites ; POST : ajout ; PATCH : seed(s) ; DELETE : retrait.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageIdQuery, StageTeamsBody } from '../schemas';
import {
  addStageTeam,
  listStageTeams,
  removeStageTeams,
  updateStageTeamSeeds,
} from '../service/teams';

export default defineAdminRoute({
  key: 'stage-teams',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => listStageTeams(ctx, query.stageId),
  }),
  POST: mutate({
    query: StageIdQuery,
    body: StageTeamsBody,
    audit: 'manage_team',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(ctx, addStageTeam(ctx, query.stageId, body)),
  }),
  PATCH: mutate({
    query: StageIdQuery,
    body: StageTeamsBody,
    audit: 'manage_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateStageTeamSeeds(ctx, query.stageId, body)),
  }),
  DELETE: mutate({
    query: StageIdQuery,
    body: StageTeamsBody,
    audit: 'manage_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, removeStageTeams(ctx, query.stageId, body)),
  }),
});
