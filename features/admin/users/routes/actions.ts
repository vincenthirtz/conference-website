// features/admin/users/routes/actions.ts — POST /api/admin/users/[userId]/actions
// `assign_captain` / `transfer_team` depuis la « Vue joueuse » (slug de
// journal selon le geste).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PlayerActionDoc, UserIdPathQuery } from '../schemas';
import { runPlayerAction } from '../service/playerActions';

export default defineAdminRoute({
  key: 'users-player-actions',
  guard: { permission: 'manage_staff' },
  POST: mutate({
    query: UserIdPathQuery,
    body: PlayerActionDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'transfer_player_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, runPlayerAction(ctx, query.userId, body)),
  }),
});
