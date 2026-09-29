// features/admin/stages/routes/lobbies.ts — /api/admin/stages/[stageId]/lobbies
// GET : lobbies FFA + placements + classement ; POST : création d'un lobby.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StageIdQuery, StageLobbyCreateBody } from '../schemas';
import { createLobby, listLobbies } from '../service/lobbies';

export default defineAdminRoute({
  key: 'admin-stage-lobbies',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: StageIdQuery,
    handler: ({ query, ctx }) => listLobbies(ctx, query.stageId),
  }),
  POST: mutate({
    query: StageIdQuery,
    body: StageLobbyCreateBody,
    // Slug historique : la création d'un lobby modifie la phase.
    audit: 'update_stage',
    status: 201,
    handler: ({ query, body, ctx }) =>
      audited(ctx, createLobby(ctx, query.stageId, body)),
  }),
});
