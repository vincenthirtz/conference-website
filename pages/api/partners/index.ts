import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable.' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category } = req.query;

  let query = supabaseAdmin
    .from('partners')
    .select('id, name, description, category, logo_url, website_url, note, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (category && typeof category === 'string') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[api/partners] error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load partners.' });
  }

  return res.status(200).json({ items: data ?? [] });
}
