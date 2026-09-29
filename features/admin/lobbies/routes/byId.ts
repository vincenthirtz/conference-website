// features/admin/lobbies/routes/byId.ts — DELETE /api/admin/lobbies/[lobbyId]
// Supprime un lobby FFA (et ses placements). Journal historique : slug
// `update_stage`, `payload.action = 'delete_lobby'`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { LobbyIdQuery } from '../schemas';
import { deleteLobby } from '../service';

export default defineAdminRoute({
  key: 'lobby',
  guard: { permission: 'arbitrate_matches' },
  DELETE: mutate({
    query: LobbyIdQuery,
    audit: 'update_stage',
    handler: ({ query, ctx }) => audited(ctx, deleteLobby(ctx, query.lobbyId)),
  }),
});
