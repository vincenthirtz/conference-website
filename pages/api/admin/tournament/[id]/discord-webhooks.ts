// pages/api/admin/tournament/[id]/discord-webhooks.ts
// Manage Discord webhook configuration for a given tournament.
// - GET: list webhooks for this tournament + global fallbacks
// - PUT: upsert a webhook for (tournament, channel_type)
// - DELETE: remove a webhook for (tournament, channel_type)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
const VALID_CHANNEL_TYPES = [
  'match_announcements',
  'match_results',
  'bracket_updates',
  'general_announcements',
  'veto_live',
  'checkin_reminders',
  'support_tickets',
  'mvp_polls',
] as const;

type ChannelType = (typeof VALID_CHANNEL_TYPES)[number];

function isValidChannelType(v: unknown): v is ChannelType {
  return (
    typeof v === 'string' &&
    (VALID_CHANNEL_TYPES as readonly string[]).includes(v)
  );
}

function sanitizeWebhookUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Discord webhooks: https://discord.com/api/webhooks/{id}/{token}
  // (also accept discordapp.com which is a legacy alias)
  if (
    !/^https:\/\/(discord|ptb\.discord|canary\.discord|discordapp)\.com\/api\/webhooks\//.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentId, res, ctx);
      case 'PUT':
        return await handlePut(tournamentId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(tournamentId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    logger.error('[discord-webhooks] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(
  tournamentId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // tenant-scoped : only this tenant's webhooks (scoped to the tournament or
  // tenant-global fallback). Cross-tenant globals are not visible from here.
  const { data, error } = await supabaseAdmin
    .from('discord_webhooks')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`)
    .order('channel_type', { ascending: true });

  if (error) {
    logger.error('[discord-webhooks] GET error:', error);
    return res.status(500).json({ error: 'Failed to load webhooks' });
  }

  const scoped = (data || []).filter(
    (w: any) => w.tournament_id === tournamentId
  );
  const globals = (data || []).filter((w: any) => w.tournament_id === null);

  return res.status(200).json({
    channelTypes: VALID_CHANNEL_TYPES,
    scoped,
    globals,
  });
}

async function handlePut(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { channelType, webhookUrl, roleMention, isActive } = req.body || {};

  if (!isValidChannelType(channelType)) {
    return res.status(400).json({
      error: `Invalid channelType. Allowed: ${VALID_CHANNEL_TYPES.join(', ')}`,
    });
  }

  const cleanUrl = sanitizeWebhookUrl(webhookUrl);
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

  // Upsert: try update first, then insert (scoped to current tenant)
  const { data: existing } = await supabaseAdmin
    .from('discord_webhooks')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
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
      .eq('tenant_id', ctx.tenantId)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('[discord-webhooks] update error:', error);
      return res.status(500).json({ error: 'Failed to update webhook' });
    }
    result = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('discord_webhooks')
      .insert({
        tenant_id: ctx.tenantId,
        tournament_id: tournamentId,
        channel_type: channelType,
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: isActive === false ? false : true,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error('[discord-webhooks] insert error:', error);
      return res.status(500).json({ error: 'Failed to create webhook' });
    }
    result = data;
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_discord_webhook',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        channel_type: channelType,
        has_role_mention: !!cleanRoleMention,
      },
    });
  }

  return res.status(200).json({ webhook: result });
}

async function handleDelete(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const channelType = req.query.channelType;
  if (!isValidChannelType(channelType)) {
    return res.status(400).json({
      error: `Invalid channelType. Allowed: ${VALID_CHANNEL_TYPES.join(', ')}`,
    });
  }

  const { error } = await supabaseAdmin
    .from('discord_webhooks')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .eq('channel_type', channelType);

  if (error) {
    logger.error('[discord-webhooks] delete error:', error);
    return res.status(500).json({ error: 'Failed to delete webhook' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'delete_discord_webhook',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: { channel_type: channelType },
    });
  }

  return res.status(200).json({ success: true });
}
