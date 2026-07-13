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
// Enrichissement SANS N+1 : on collecte les auth_user_id de la page, puis UN
// seul `player_ratings.in('user_id', ids)` (agrégé cross-tenant en JS) et UN
// seul getDiscordLinksForUsers(ids). Le flag show_ratings de chaque ligne est
// respecté : stats omises quand false.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';

type DirectoryRow = {
  auth_user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  tagline?: string | null;
  show_ratings?: boolean | null;
};

type RatingRow = {
  user_id: string;
  tenant_id: string;
  games_played?: number | null;
  peak_rating?: number | null;
};

type PlayerStats = { games: number; peakRating: number; tenants: number };

type DirectoryPlayer = {
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  discordUsername: string | null;
  stats?: PlayerStats;
};

const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Agrège les lignes player_ratings (une par tenant) par user_id :
 *   games = somme(games_played), peakRating = max(peak_rating),
 *   tenants = nb de tenant_id distincts.
 */
function aggregateRatings(rows: RatingRow[]): Map<string, PlayerStats> {
  const acc = new Map<
    string,
    { games: number; peakRating: number; tenants: Set<string> }
  >();
  for (const r of rows) {
    let entry = acc.get(r.user_id);
    if (!entry) {
      entry = { games: 0, peakRating: 0, tenants: new Set<string>() };
      acc.set(r.user_id, entry);
    }
    entry.games += Number(r.games_played ?? 0);
    entry.peakRating = Math.max(entry.peakRating, Number(r.peak_rating ?? 0));
    if (r.tenant_id) entry.tenants.add(r.tenant_id);
  }
  const out = new Map<string, PlayerStats>();
  for (const [userId, e] of acc) {
    out.set(userId, {
      games: e.games,
      peakRating: e.peakRating,
      tenants: e.tenants.size,
    });
  }
  return out;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  _ctx: { user: User }
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
  let query = supabaseAdmin!
    .from('player_discovery_profiles')
    .select('auth_user_id, display_name, avatar_url, tagline, show_ratings', {
      count: 'exact',
    })
    .eq('discoverable', true);

  if (q) query = query.ilike('display_name', `%${q}%`);

  query = query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error('[player/discovery/search] query error', error);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const rows = (data as DirectoryRow[] | null) ?? [];
  const ids = rows.map((r) => r.auth_user_id);

  // Enrichissement bulk (aucun N+1) : un seul appel ratings + un seul discord.
  let statsByUser = new Map<string, PlayerStats>();
  let discordByUser = new Map<string, { discordUsername: string | null }>();

  if (ids.length > 0) {
    const { data: ratingRows, error: ratingError } = await supabaseAdmin!
      .from('player_ratings')
      .select('user_id, tenant_id, games_played, peak_rating')
      .in('user_id', ids);

    if (ratingError) {
      logger.error('[player/discovery/search] ratings error', ratingError);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
    statsByUser = aggregateRatings((ratingRows as RatingRow[] | null) ?? []);
    discordByUser = await getDiscordLinksForUsers(ids);
  }

  const players: DirectoryPlayer[] = rows.map((row) => {
    const discordUsername =
      discordByUser.get(row.auth_user_id)?.discordUsername ?? null;
    const player: DirectoryPlayer = {
      authUserId: row.auth_user_id,
      displayName: row.display_name ?? discordUsername ?? 'Joueur',
      avatarUrl: row.avatar_url ?? null,
      tagline: row.tagline ?? null,
      discordUsername,
    };
    // Respect du flag par ligne : stats omises si show_ratings=false.
    if (row.show_ratings !== false) {
      const stats = statsByUser.get(row.auth_user_id);
      if (stats) player.stats = stats;
    }
    // TODO show_teams : enrichissement des équipes/participations (cross-tenant)
    // laissé pour une slice ultérieure — pas de jointure team_members ici.
    return player;
  });

  return res.status(200).json({
    players,
    total: count ?? players.length,
    limit,
    offset,
  });
}

export default withAuthRoute(handler);
