// features/admin/twitch/routes/rewards.ts — /api/admin/twitch/channel-points/rewards
//   GET  : récompenses gérables (`?all=1` : toutes, lecture seule).
//   POST : crée une récompense (scope channel:manage:redemptions).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateRewardDoc, RewardsListQuery } from '../schemas';
import { createReward, listRewards } from '../service/channelPoints';
import { PER_MIN_30, PER_MIN_60, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-rewards',
  guard: TWITCH_GUARD,
  GET: read({
    query: RewardsListQuery,
    rateLimit: PER_MIN_60,
    handler: ({ ctx, req }) => listRewards(ctx, req.query.all),
  }),
  POST: mutate({
    body: CreateRewardDoc,
    rateLimit: PER_MIN_30,
    audit: 'create_twitch_reward',
    handler: ({ ctx, req }) => audited(ctx, createReward(ctx, req.body)),
  }),
});
