// pages/api/tournaments/index.ts
// API publique pour lister les tournois visibles
// - GET : liste des tournois publics (published, running, completed)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { parsePagination } from '@/utils/apiHelpers';

export type PublicTournament = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  game: string | null;
  status: string;
  format: string | null;
  start_date: string | null;
  end_date: string | null;
  max_teams: number | null;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
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
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { status } = req.query;

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, { limit: 50 });

    const selectColumns = `
      id,
      name,
      slug,
      short_name,
      game,
      status,
      format,
      start_date,
      end_date,
      max_teams,
      logo_url,
      banner_url,
      created_at
    `;

    let query = supabaseAdmin
      .from('tournaments')
      .select(selectColumns, { count: 'exact' })
      // Exclure les drafts et archived - seulement les tournois visibles
      .in('status', ['published', 'running', 'completed']);

    // Filtrer par status spécifique si demandé
    if (status && !Array.isArray(status)) {
      if (['published', 'running', 'completed'].includes(status)) {
        query = query.eq('status', status);
      }
    }

    // Ordonner par date de début (les plus récents d'abord), puis par created_at
    query = query
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/tournaments] error:', error);
      return res.status(500).json({ error: 'Failed to fetch tournaments' });
    }

    return res.status(200).json({
      tournaments: (data || []) as PublicTournament[],
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: any) {
    console.error('[api/tournaments] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
