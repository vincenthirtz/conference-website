// features/admin/lobbies/routes/placements.ts —
// PUT /api/admin/lobbies/[lobbyId]/placements : saisie des placements d'un
// lobby FFA. Journal historique : slug `update_scores`,
// `payload.action = 'save_placements'`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { LobbyIdQuery, PlacementsDoc } from '../schemas';
import { savePlacements } from '../service';

export default defineAdminRoute({
  key: 'lobby-placements',
  guard: { permission: 'arbitrate_matches' },
  PUT: mutate({
    query: LobbyIdQuery,
    body: PlacementsDoc,
    audit: 'update_scores',
    handler: ({ query, body, ctx }) =>
      audited(ctx, savePlacements(ctx, query.lobbyId, body)),
  }),
});
