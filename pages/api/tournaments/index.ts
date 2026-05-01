// pages/api/tournaments/index.ts
// API publique pour lister les tournois visibles
// - GET : liste des tournois publics (published, running, completed)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { parsePagination } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../utils/logger';
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

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'tournaments'))
    return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { status, id } = req.query;

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 50,
    });

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
      .select(selectColumns, { count: 'exact' });

    // When fetching a specific tournament by ID, skip status filter
    if (id && typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
      query = query.eq('id', id);
    } else {
      // Exclure les drafts et archived - seulement les tournois visibles
      query = query.in('status', ['published', 'running', 'completed']);

      // Filtrer par status spécifique si demandé
      if (status && !Array.isArray(status)) {
        if (['published', 'running', 'completed'].includes(status)) {
          query = query.eq('status', status);
        }
      }
    }

    // Ordonner par date de début (les plus récents d'abord), puis par created_at
    query = query
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[api/tournaments] error:', error);
      return res.status(500).json({ error: 'Failed to fetch tournaments' });
    }

    // Enrich with team_count from tournament_teams
    const tournamentIds = (data || []).map((t) => t.id);
    let teamCountMap: Record<string, number> = {};
    if (tournamentIds.length > 0) {
      const { data: teamCounts } = await supabaseAdmin
        .from('tournament_teams')
        .select('tournament_id')
        .in('tournament_id', tournamentIds);
      if (teamCounts) {
        for (const row of teamCounts) {
          teamCountMap[row.tournament_id] =
            (teamCountMap[row.tournament_id] || 0) + 1;
        }
      }
    }

    const enriched = (data || []).map((t) => ({
      ...t,
      team_count: teamCountMap[t.id] || 0,
    }));

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=120'
    );
    return res.status(200).json({
      tournaments: enriched,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    logger.error('[api/tournaments] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
