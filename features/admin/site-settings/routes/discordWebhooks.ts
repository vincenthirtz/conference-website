// features/admin/site-settings/routes/discordWebhooks.ts
// /api/admin/site-settings/discord-webhooks — webhooks Discord *globaux*
// (tournament_id IS NULL), fallback « maître » quand un tournoi n'a pas le sien
// pour un type de salon (cf. resolveWebhook dans utils/discord.ts).
//
// - GET    : liste des webhooks globaux
// - PUT    : upsert d'un webhook global pour (channel_type)
// - DELETE : suppression d'un webhook global pour (channel_type)

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { DiscordWebhookDeleteQuery } from '../schemas';
import {
  deleteGlobalWebhook,
  listGlobalWebhooks,
  upsertGlobalWebhook,
} from '../service';

export default defineAdminRoute({
  key: 'site-settings-discord-webhooks',
  guard: { permission: 'manage_settings' },
  GET: read({ handler: ({ ctx }) => listGlobalWebhooks(ctx) }),
  PUT: mutate({
    audit: 'update_discord_webhook',
    handler: async ({ req, ctx }) => {
      const { webhook, channelType, hasRoleMention } =
        await upsertGlobalWebhook(ctx, req.body);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: null,
        tournament_id: null,
        payload: {
          scope: 'global',
          channel_type: channelType,
          has_role_mention: hasRoleMention,
        },
      });
      return { webhook };
    },
  }),
  DELETE: mutate({
    query: DiscordWebhookDeleteQuery,
    audit: 'delete_discord_webhook',
    handler: async ({ query, ctx }) => {
      await deleteGlobalWebhook(ctx, query.channelType);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: null,
        tournament_id: null,
        payload: { scope: 'global', channel_type: query.channelType },
      });
      return { success: true as const };
    },
  }),
});
