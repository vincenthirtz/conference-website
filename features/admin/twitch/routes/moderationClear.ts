// features/admin/twitch/routes/moderationClear.ts — POST /api/admin/twitch/moderation/clear
// Vide le chat (scope moderator:manage:chat_messages).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { clearChat } from '../service/actions';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-moderation-clear',
  guard: TWITCH_GUARD,
  POST: mutate({
    rateLimit: PER_MIN_30,
    audit: 'twitch_clear_chat',
    handler: ({ ctx }) => audited(ctx, clearChat(ctx)),
  }),
});
