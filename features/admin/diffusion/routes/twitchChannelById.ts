// features/admin/diffusion/routes/twitchChannelById.ts
// /api/admin/twitch-channels/[id] — lecture, mise à jour partielle, retrait.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { TwitchChannelIdQuery, TwitchChannelPatch } from '../schemas';
import {
  deleteTwitchChannelById,
  getTwitchChannelById,
  updateTwitchChannelById,
} from '../service';

export default defineAdminRoute({
  key: 'twitch-channel-id',
  guard: { permission: 'manage_broadcast' },
  GET: read({
    query: TwitchChannelIdQuery,
    handler: ({ query, ctx }) => getTwitchChannelById(ctx, query.id),
  }),
  PATCH: mutate({
    query: TwitchChannelIdQuery,
    body: TwitchChannelPatch,
    audit: 'update_twitch_channel',
    handler: async ({ query, body, ctx }) => {
      const { row, fields } = await updateTwitchChannelById(
        ctx,
        query.id,
        body
      );
      ctx.audit({
        entity_type: 'twitch_channel',
        entity_id: query.id,
        payload: { fields },
      });
      return row;
    },
  }),
  DELETE: mutate({
    query: TwitchChannelIdQuery,
    status: 204,
    audit: 'delete_twitch_channel',
    handler: async ({ query, ctx }) => {
      await deleteTwitchChannelById(ctx, query.id);
      ctx.audit({ entity_type: 'twitch_channel', entity_id: query.id });
    },
  }),
});
