// features/admin/twitch/routes/chat.ts — POST /api/admin/twitch/chat
// Message dans le chat de la chaîne (scope user:write:chat).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SendChatDoc } from '../schemas';
import { sendChat } from '../service/actions';
import { PER_MIN_60, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-chat',
  guard: TWITCH_GUARD,
  POST: mutate({
    body: SendChatDoc,
    rateLimit: PER_MIN_60,
    audit: 'send_twitch_chat',
    handler: ({ ctx, req }) => audited(ctx, sendChat(ctx, req.body)),
  }),
});
