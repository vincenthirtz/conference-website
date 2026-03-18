// pages/api/teams/index.ts
// API publique pour lister les équipes actives
// - GET : liste des équipes avec recherche optionnelle

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { parsePagination, sanitizeSearch, escapePostgrestValue } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

export type PublicTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'teams')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { limit: limitNum, offset: offsetNum } = parsePagination(req, { limit: 100 });
    const search = sanitizeSearch(req.query.search);

    let query = supabaseAdmin
      .from('teams')
      .select('id, name, short_name, logo_url, country', {
        count: 'exact',
      });

    // Recherche par nom
    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(`name.ilike.${s},short_name.ilike.${s}`);
    }

    query = query
      .order('name', { ascending: true })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/teams] error:', error);
      return res.status(500).json({ error: 'Failed to fetch teams' });
    }

    return res.status(200).json({
      teams: (data || []) as PublicTeam[],
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: any) {
    console.error('[api/teams] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
