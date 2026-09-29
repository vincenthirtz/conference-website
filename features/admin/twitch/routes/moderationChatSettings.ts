// features/admin/twitch/routes/moderationChatSettings.ts — PATCH /api/admin/twitch/moderation/chat-settings
// Modes du chat (scope moderator:manage:chat_settings).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ChatSettingsDoc } from '../schemas';
import { updateChatSettings } from '../service/actions';
import { PER_MIN_30, TWITCH_GUARD } from './limits';

export default defineAdminRoute({
  key: 'admin-twitch-moderation-chat-settings',
  guard: TWITCH_GUARD,
  PATCH: mutate({
    body: ChatSettingsDoc,
    rateLimit: PER_MIN_30,
    audit: 'twitch_chat_settings',
    handler: ({ ctx, req }) => audited(ctx, updateChatSettings(ctx, req.body)),
  }),
});
