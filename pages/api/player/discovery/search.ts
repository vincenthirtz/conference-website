// pages/api/player/discovery/search.ts
//
// GET /api/player/discovery/search
//
// Annuaire des joueurs DÉCOUVRABLES du réseau (cross-tenant). DERRIÈRE LE LOGIN :
// la route est wrappée dans withAuthRoute → 401 sans Bearer valide. Il n'existe
// AUCUNE variante publique / indexable SEO (arbitrage produit verrouillé le
// 2026-07-13). La table player_discovery_profiles est RLS service-role only :
// tout passe par supabaseAdmin, filtré manuellement sur discoverable=true.
//
// Le caller ne s'auto-liste jamais (.neq auth_user_id) : on ne se suit pas
// soi-même. L'enrichissement SANS N+1 (stats show_ratings, équipes show_teams,
// discord, isFollowing/followerCount) est mutualisé avec les listes de suivi
// dans utils/playerDiscoveryEnrich.buildDirectoryPlayers.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  buildDirectoryPlayers,
  type DiscoveryProfileRow,
} from '@/utils/playerDiscoveryEnrich';

const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-discovery-search'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = searchQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_QUERY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { limit, offset } = parsed.data;
  const q =
    parsed.data.q && parsed.data.q.length > 0 ? parsed.data.q : undefined;

  // Page de l'annuaire + total exact (count sur l'ensemble filtré, pré-range).
  // On exclut le caller lui-même : on ne se suit pas soi-même.
  let query = supabaseAdmin!
    .from('player_discovery_profiles')
    .select(
      'auth_user_id, display_name, avatar_url, tagline, show_ratings, show_teams',
      { count: 'exact' }
    )
    .eq('discoverable', true)
    .neq('auth_user_id', ctx.user.id);

  if (q) query = query.ilike('display_name', `%${q}%`);

  query = query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error('[player/discovery/search] query error', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const rows = (data as DiscoveryProfileRow[] | null) ?? [];

  let players;
  try {
    players = await buildDirectoryPlayers(rows, ctx.user.id);
  } catch (e) {
    logger.error('[player/discovery/search] enrich error', e);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({
    players,
    total: count ?? players.length,
    limit,
    offset,
  });
}

export default withAuthRoute(handler);
