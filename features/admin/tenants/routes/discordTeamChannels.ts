// features/admin/tenants/routes/discordTeamChannels.ts
// /api/admin/discord/team-channels — GET état des salons d'équipe (site vs
// bot) ; POST une action nommée, relayée au bot (202).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamChannelActionDoc } from '../schemas';
import {
  getTeamChannelsState,
  requestTeamChannelAction,
} from '../service/teamChannels';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-discord-channels',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getTeamChannelsState(ctx),
  }),
  POST: mutate({
    body: TeamChannelActionDoc,
    rateLimit: LIMIT,
    status: 202,
    // Slug de la méthode ; chaque action pose le sien (`discord_provision`…).
    audit: 'discord_refresh',
    // Corps BRUT : le 400 garde son code historique (`INVALID_BODY`).
    handler: ({ ctx, req }) =>
      audited(ctx, requestTeamChannelAction(ctx, req.body, ctx.staff.staff.id)),
  }),
});
