import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

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
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-twitch-id')
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;
  const tenantId = ctx.tenantId;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('twitch_channels')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      logger.error('[admin/twitch-channels] get error', error);
      return res.status(404).json({ error: 'Channel not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as TwitchChannelPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.channel === 'string')
      updatePayload.channel = body.channel.trim().toLowerCase();
    if (typeof body.label === 'string') updatePayload.label = body.label.trim();
    if ('badge' in body) updatePayload.badge = body.badge?.trim() || null;
    if ('description' in body)
      updatePayload.description = body.description?.trim() || null;
    if ('backgroundUrl' in body)
      updatePayload.background_url = sanitizeUrl(body.backgroundUrl);
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('sortOrder' in body && Number.isFinite(body.sortOrder))
      updatePayload.sort_order = Number(body.sortOrder);

    const { data, error } = await admin
      .from('twitch_channels')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      logger.error('[admin/twitch-channels] update error', error);
      if (error.code === '23505') {
        return res.status(400).json({ error: 'This channel already exists.' });
      }
      return res.status(500).json({ error: 'Failed to update the channel.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('twitch_channels')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[admin/twitch-channels] delete error', error);
      return res.status(500).json({ error: 'Failed to delete the channel.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
