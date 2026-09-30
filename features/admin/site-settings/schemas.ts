// features/admin/site-settings/schemas.ts — réglages du site par tenant :
// clés libres, logos d'événement, rôles d'équipe, webhooks Discord globaux.
//
// Les corps gardent leur validation historique (messages exacts, lus par les
// écrans) : le service les applique ; seuls les paramètres d'URL passent par
// la validation de `defineAdminRoute`.

import * as z from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { DISCORD_CHANNEL_TYPES } from '../../../utils/discord/channels';

/** `/api/admin/site-settings/[key]` */
export const SiteSettingKeyQuery = z.object({
  key: z.string({ error: 'Missing key.' }).min(1, { error: 'Missing key.' }),
});

export const INVALID_CHANNEL_TYPE_MESSAGE = `Invalid channelType. Allowed: ${DISCORD_CHANNEL_TYPES.join(', ')}`;

/** DELETE `/api/admin/site-settings/discord-webhooks?channelType=` */
export const DiscordWebhookDeleteQuery = z.object({
  channelType: z.enum(DISCORD_CHANNEL_TYPES, {
    error: INVALID_CHANNEL_TYPE_MESSAGE,
  }),
});

/** Toutes les colonnes de `site_settings` (ex-`select('*')`). */
export const SITE_SETTING_COLUMNS =
  'key, value, description, tenant_id, updated_at, updated_by' as const;

/** Toutes les colonnes de `discord_webhooks` (ex-`select('*')`). */
export const DISCORD_WEBHOOK_COLUMNS =
  'id, tenant_id, tournament_id, channel_type, webhook_url, role_mention, is_active, last_post_at, last_post_status, created_at, updated_at' as const;
