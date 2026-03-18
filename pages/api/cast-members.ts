import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'cast-members')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable.' });
  }

  const { data, error } = await supabaseAdmin
    .from('cast_members')
    .select('id, name, title, description, image_url, twitch_url, city, is_promo, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[api/cast-members] error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load cast members.' });
  }

  // Transform to camelCase for frontend consumption
  const items = (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    title: item.title,
    description: item.description,
    imageUrl: item.image_url,
    twitchUrl: item.twitch_url,
    city: item.city,
    isPromo: item.is_promo,
    sortOrder: item.sort_order,
  }));

  return res.status(200).json({ items });
}
