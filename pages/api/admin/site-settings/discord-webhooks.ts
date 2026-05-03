// pages/api/admin/site-settings/discord-webhooks.ts
// Gestion des webhooks Discord *globaux* (tournament_id IS NULL).
//
// Ces webhooks servent de fallback "maitre" : si aucun webhook n'est configure
// au niveau d'un tournoi pour un type de channel donne, c'est cette config qui
// prend le relais (cf. resolveWebhook dans utils/discord.ts).
//
// - GET    : liste des webhooks globaux
// - PUT    : upsert d'un webhook global pour (channel_type)
// - DELETE : suppression d'un webhook global pour (channel_type)
//
// Reserve au role admin (idem que la version per-tournoi).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  DISCORD_CHANNEL_TYPES,
  isDiscordChannelType,
  sanitizeDiscordWebhookUrl,
} from '@/utils/discord/channels';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(res);
      case 'PUT':
        return await handlePut(req, res, ctx);
      case 'DELETE':
        return await handleDelete(req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    logger.error('[site-settings/discord-webhooks] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from('discord_webhooks')
    .select('*')
    .is('tournament_id', null)
    .order('channel_type', { ascending: true });

  if (error) {
    logger.error('[site-settings/discord-webhooks] GET error:', error);
    return res.status(500).json({ error: 'Failed to load webhooks' });
  }

  return res.status(200).json({
    channelTypes: DISCORD_CHANNEL_TYPES,
    globals: data || [],
  });
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { channelType, webhookUrl, roleMention, isActive } = req.body || {};

  if (!isDiscordChannelType(channelType)) {
    return res.status(400).json({
      error: `Invalid channelType. Allowed: ${DISCORD_CHANNEL_TYPES.join(', ')}`,
    });
  }

  const cleanUrl = sanitizeDiscordWebhookUrl(webhookUrl);
  if (!cleanUrl) {
    return res.status(400).json({
      error:
        'webhookUrl must be a valid https://discord.com/api/webhooks/... URL',
    });
  }

  const cleanRoleMention =
    typeof roleMention === 'string' && roleMention.trim()
      ? roleMention.trim()
      : null;

  // Upsert : try update first (matched by tournament_id IS NULL + channel_type), then insert
  const { data: existing } = await supabaseAdmin
    .from('discord_webhooks')
    .select('id')
    .is('tournament_id', null)
    .eq('channel_type', channelType)
    .maybeSingle();

  let result;
  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('discord_webhooks')
      .update({
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: isActive === false ? false : true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('[site-settings/discord-webhooks] update error:', error);
      return res.status(500).json({ error: 'Failed to update webhook' });
    }
    result = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('discord_webhooks')
      .insert({
        tournament_id: null,
        channel_type: channelType,
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: isActive === false ? false : true,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('[site-settings/discord-webhooks] insert error:', error);
      return res.status(500).json({ error: 'Failed to create webhook' });
    }
    result = data;
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'update_discord_webhook',
    entity_type: 'site_settings',
    entity_id: null,
    tournament_id: null,
    payload: {
      scope: 'global',
      channel_type: channelType,
      has_role_mention: !!cleanRoleMention,
    },
  });

  return res.status(200).json({ webhook: result });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const channelType = req.query.channelType;
  if (!isDiscordChannelType(channelType)) {
    return res.status(400).json({
      error: `Invalid channelType. Allowed: ${DISCORD_CHANNEL_TYPES.join(', ')}`,
    });
  }

  const { error } = await supabaseAdmin
    .from('discord_webhooks')
    .delete()
    .is('tournament_id', null)
    .eq('channel_type', channelType);

  if (error) {
    logger.error('[site-settings/discord-webhooks] delete error:', error);
    return res.status(500).json({ error: 'Failed to delete webhook' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'delete_discord_webhook',
    entity_type: 'site_settings',
    entity_id: null,
    tournament_id: null,
    payload: { scope: 'global', channel_type: channelType },
  });

  return res.status(200).json({ success: true });
}
