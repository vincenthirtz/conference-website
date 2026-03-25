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
  member_count: number;
  is_joinable: boolean;
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

    const joinable = req.query.joinable;

    let query = supabaseAdmin
      .from('teams')
      .select('id, name, short_name, logo_url, country, is_joinable, team_members(count)', {
        count: 'exact',
      });

    // Filter by joinable status
    if (joinable === '1' || joinable === 'true') {
      query = query.eq('is_joinable', true);
    }

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

    // Aplatir le count des membres
    const teams = (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      logo_url: t.logo_url,
      country: t.country,
      member_count: t.team_members?.[0]?.count ?? 0,
      is_joinable: t.is_joinable ?? false,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=120');
    return res.status(200).json({
      teams,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    console.error('[api/teams] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
