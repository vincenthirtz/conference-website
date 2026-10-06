// features/admin/logs/routes/discordEventReplay.ts
// POST /api/admin/discord-logs/replay { id } — remet en file (pending) une
// ligne `failed` de `bot_event_outbox` pour que le poller du bot la relise.
// Même permission que la lecture du journal Discord.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { DiscordEventReplayDoc } from '../schemas';
import { replayDiscordEvent } from '../service';

export default defineAdminRoute({
  key: 'admin-discord-event-replay',
  guard: { permission: 'manage_settings' },
  POST: mutate({
    body: DiscordEventReplayDoc,
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: 'replay_bot_event',
    handler: ({ ctx, req }) => audited(ctx, replayDiscordEvent(ctx, req.body)),
  }),
});
