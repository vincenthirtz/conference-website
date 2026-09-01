import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';
type TwitchChannelPayload = {
  channel?: string;
  label?: string;
  badge?: string | null;
  description?: string | null;
  backgroundUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-twitch'))
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;
  const tenantId = ctx.tenantId;

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const includeInactive = req.query.includeInactive === 'true';

    let query = admin
      .from('twitch_channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[admin/twitch-channels] list error', error);
      return res.status(500).json({ error: 'Failed to load channels.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as TwitchChannelPayload;
    if (!body.channel || !body.label) {
      return res.status(400).json({ error: 'Channel and label are required.' });
    }

    // Récupérer le prochain sort_order (scopé au tenant courant).
    const { data: maxOrder } = await admin
      .from('twitch_channels')
      .select('sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    const insertPayload = {
      tenant_id: tenantId,
      channel: body.channel.trim().toLowerCase(),
      label: body.label.trim(),
      badge: body.badge?.trim() || null,
      description: body.description?.trim() || null,
      background_url: sanitizeUrl(body.backgroundUrl),
      is_active: body.isActive ?? true,
      sort_order: body.sortOrder ?? nextOrder,
    };

    const { data, error } = await admin
      .from('twitch_channels')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[admin/twitch-channels] create error', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'This channel already exists.' });
      }
      return res.status(500).json({ error: 'Failed to create the channel.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_twitch_channel',
          entity_type: 'twitch_channel',
          entity_id: data.id,
          tenant_id: ctx.tenantId,
          payload: { channel: data.channel, label: data.label },
        });
      } catch (logErr) {
        logger.error('logStaffAction(create_twitch_channel) error:', logErr);
      }
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
