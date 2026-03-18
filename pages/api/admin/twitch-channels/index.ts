import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { sanitizeUrl } from '@/utils/apiHelpers';

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
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const includeInactive = req.query.includeInactive === 'true';

    let query = admin
      .from('twitch_channels')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/twitch-channels] list error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load channels.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as TwitchChannelPayload;
    if (!body.channel || !body.label) {
      return res
        .status(400)
        .json({ error: 'Channel and label are required.' });
    }

    // Récupérer le prochain sort_order
    const { data: maxOrder } = await admin
      .from('twitch_channels')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    const insertPayload = {
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
      console.error('[admin/twitch-channels] create error', error);
      if (error.code === '23505') {
        return res
          .status(400)
          .json({ error: 'This channel already exists.' });
      }
      return res
        .status(500)
        .json({ error: 'Failed to create the channel.' });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
