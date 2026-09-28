// features/admin/diffusion/routes/twitchChannels.admin.ts
// /api/admin/twitch-channels — liste éditable (GET) et création (POST).
// À ne pas confondre avec `twitchChannels.ts` (lecture seule, tout le staff).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { TwitchChannelBody, TwitchChannelListQuery } from '../schemas';
import { createTwitchChannel, listTwitchChannelsForEdit } from '../service';

export default defineAdminRoute({
  key: 'twitch-channels',
  guard: { permission: 'manage_broadcast' },
  GET: read({
    query: TwitchChannelListQuery,
    handler: ({ query, ctx }) => listTwitchChannelsForEdit(ctx, query),
  }),
  POST: mutate({
    body: TwitchChannelBody,
    status: 201,
    audit: 'create_twitch_channel',
    handler: async ({ body, ctx }) => {
      const row = await createTwitchChannel(ctx, body);
      ctx.audit({
        entity_type: 'twitch_channel',
        entity_id: row.id,
        after: row,
      });
      return row;
    },
  }),
});
