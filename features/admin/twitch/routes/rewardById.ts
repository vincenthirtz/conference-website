// features/admin/twitch/routes/rewardById.ts — /api/admin/twitch/channel-points/rewards/[id]
//   PATCH  : met à jour une récompense (≥ 1 champ).
//   DELETE : supprime une récompense.
// Helix n'édite QUE les récompenses créées par NOTRE client_id.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TwitchIdQuery, UpdateRewardDoc } from '../schemas';
import { deleteReward, updateReward } from '../service/channelPoints';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-reward-by-id',
  guard: TWITCH_GUARD,
  PATCH: mutate({
    query: TwitchIdQuery,
    body: UpdateRewardDoc,
    rateLimit: PER_MIN_30,
    audit: 'update_twitch_reward',
    handler: ({ ctx, req }) =>
      audited(ctx, updateReward(ctx, req.query.id, req.body)),
  }),
  DELETE: mutate({
    query: TwitchIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'delete_twitch_reward',
    handler: ({ ctx, req }) => audited(ctx, deleteReward(ctx, req.query.id)),
  }),
});
