import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { key } = req.query;

  // If a specific key is requested (alphanumeric + underscores only)
  if (key && typeof key === 'string') {
    if (!/^[a-zA-Z0-9_]{1,100}$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key format.' });
    }
    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .select('key, value')
      .eq('key', key)
      .single();

    if (error) {
      // Return null value if not found (for graceful fallback)
      return res.status(200).json({ key, value: null });
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(data);
  }

  // Return all settings (only key and value, not description)
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('key, value')
    .order('key');

  if (error) {
    console.error('[site-settings] list error', error);
    return res.status(500).json({ error: 'Failed to load settings.' });
  }

  // Convert to key-value object for easier consumption
  const settings: Record<string, string> = {};
  for (const item of data ?? []) {
    settings[item.key] = item.value;
  }

  // Cache for 5 minutes
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(settings);
}
