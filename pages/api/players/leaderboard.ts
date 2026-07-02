// pages/api/players/leaderboard.ts
// API publique : classement des joueurs par rating Glicko-2 persistant.
// Lecture via supabaseAdmin, tenant = DEFAULT_TENANT_ID (style maps/stats.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { parsePagination } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  PlayerRatingRow,
} from '@/types/rating';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'players-leaderboard'
    )
  )
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { limit, offset } = parsePagination(req, {
    limit: 50,
    offset: 0,
    maxLimit: 200,
  });

  try {
    const tenantId = resolveTenantIdForPublicRequest(req);

    // On classe par rating desc en interne : le rank est la position globale
    // (offset + i + 1). Pour rester exact avec l'offset on lit tous les
    // joueurs notés triés par rating, puis on tranche — les ensembles sont
    // petits (dizaines à centaines de joueurs).
    const { data, error } = await supabaseAdmin
      .from('player_ratings')
      .select(
        'user_id, rating, rd, games_played, wins, losses, display_name, battle_tag, avatar_url'
      )
      .eq('tenant_id', tenantId)
      .gt('games_played', 0)
      .order('rating', { ascending: false });

    if (error) {
      logger.error('[players/leaderboard] read error', error);
      return res.status(500).json({ error: 'Failed to load leaderboard' });
    }

    const rows = (data || []) as Array<
      Pick<
        PlayerRatingRow,
        | 'user_id'
        | 'rating'
        | 'rd'
        | 'games_played'
        | 'wins'
        | 'losses'
        | 'display_name'
        | 'battle_tag'
        | 'avatar_url'
      >
    >;

    // Tri défensif (le mock ne trie pas) : rating desc, puis user_id asc.
    rows.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
    });

    const sliced = rows.slice(offset, offset + limit);
    const players: LeaderboardPlayer[] = sliced.map((r, i) => ({
      userId: r.user_id,
      displayName: r.display_name ?? null,
      battleTag: r.battle_tag ?? null,
      avatarUrl: r.avatar_url ?? null,
      rating: r.rating,
      rd: r.rd,
      gamesPlayed: r.games_played,
      wins: r.wins,
      losses: r.losses,
      rank: offset + i + 1,
    }));

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
    const response: LeaderboardResponse = { players };
    return res.status(200).json(response);
  } catch (err) {
    logger.error('[players/leaderboard] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
