import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

export type TwitchChannelPublic = {
  channel: string;
  label: string;
  badge: string | null;
  description: string | null;
  background: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('twitch_channels')
      .select('channel, label, badge, description, background_url')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[/api/twitch-channels] fetch error', error);
      return res
        .status(500)
        .json({ error: 'Failed to load channels.' });
    }

    const items: TwitchChannelPublic[] = (data || []).map((row) => ({
      channel: row.channel,
      label: row.label,
      badge: row.badge,
      description: row.description,
      background: row.background_url,
    }));

    // Cache 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json({ items });
  } catch (err) {
    console.error('[/api/twitch-channels] error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
