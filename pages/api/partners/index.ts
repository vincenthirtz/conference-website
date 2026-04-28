import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'partners'))
    return;
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category } = req.query;

  let query = supabaseAdmin
    .from('partners')
    .select(
      'id, name, description, category, logo_url, website_url, note, display_order'
    )
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[api/partners] error', error);
    return res.status(500).json({ error: 'Failed to load partners.' });
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=900, stale-while-revalidate=300'
  );
  return res.status(200).json({ items: data ?? [] });
}
