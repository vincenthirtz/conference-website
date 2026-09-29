// features/admin/tournaments/routes/discordWebhooks.ts — …/[id]/discord-webhooks
// GET : webhooks du tournoi + replis globaux du tenant ; PUT : upsert par
// type de salon ; DELETE ?channelType= : retrait.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { DiscordWebhookBody, DiscordWebhooksQuery } from '../schemas';
import { deleteWebhook, listWebhooks, upsertWebhook } from '../service/ops';

export default defineAdminRoute({
  key: 'admin-tournament-discord-webhooks',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: DiscordWebhooksQuery,
    handler: ({ query, ctx }) => listWebhooks(ctx, query.id),
  }),
  PUT: mutate({
    query: DiscordWebhooksQuery,
    body: DiscordWebhookBody,
    // La réponse contient l'URL du webhook (jeton Discord) : le cache
    // d'idempotence stockerait ce secret en base.
    idempotent: false,
    audit: 'update_discord_webhook',
    handler: ({ query, body, ctx }) =>
      audited(ctx, upsertWebhook(ctx, query.id, body)),
  }),
  DELETE: mutate({
    query: DiscordWebhooksQuery,
    audit: 'delete_discord_webhook',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteWebhook(ctx, query.id, query.channelType)),
  }),
});
