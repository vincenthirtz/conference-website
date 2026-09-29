// features/admin/twitch/routes/moderationBan.ts — POST /api/admin/twitch/moderation/ban
// Ban ou timeout d'un login (scope moderator:manage:banned_users).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { BanDoc } from '../schemas';
import { banUser } from '../service/actions';
import { PER_MIN_60, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-moderation-ban',
  guard: TWITCH_GUARD,
  POST: mutate({
    body: BanDoc,
    rateLimit: PER_MIN_60,
    audit: 'twitch_ban',
    handler: ({ ctx, req }) => audited(ctx, banUser(ctx, req.body)),
  }),
});
