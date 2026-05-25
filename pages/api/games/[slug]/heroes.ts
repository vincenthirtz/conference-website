// pages/api/games/[slug]/heroes.ts
// Public hero pool endpoint for the MOBA draft UI (LoL champions, Dota 2 heroes).
// Reads the cached pool from public.game_heroes (synced once a day by
// /api/cron/sync-game-heroes). Tenant-agnostic: heroes are global.

import type { NextApiRequest, NextApiResponse } from 'next';
import { isGameSlug } from '@/config/games';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../../utils/logger';

const HERO_GAMES = new Set(['lol', 'dota2']);

type HeroDTO = {
  id: string;
  game: 'lol' | 'dota2';
  externalId: string;
  key: string;
  name: string;
  title: string | null;
  roles: string[];
  attribute: string | null;
  imageUrl: string;
  iconUrl: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'games-heroes')) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const slugParam = req.query.slug;
  const slug = typeof slugParam === 'string' ? slugParam : '';

  if (!isGameSlug(slug)) {
    return res.status(404).json({ error: 'Unknown game slug' });
  }
  if (!HERO_GAMES.has(slug)) {
    return res
      .status(404)
      .json({ error: `Game "${slug}" has no hero pool` });
  }

  const includeDisabled =
    req.query.includeDisabled === '1' || req.query.includeDisabled === 'true';

  try {
    let query = supabaseAdmin
      .from('game_heroes')
      .select(
        'id, game, external_id, key, name, title, roles, attribute, image_url, icon_url'
      )
      .eq('game', slug)
      .order('name', { ascending: true });

    if (!includeDisabled) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('[api/games/%s/heroes] db error:', slug, error);
      return res.status(500).json({ error: 'Failed to fetch heroes.' });
    }

    const heroes: HeroDTO[] = (data ?? []).map((row: any) => ({
      id: row.id,
      game: row.game,
      externalId: row.external_id,
      key: row.key,
      name: row.name,
      title: row.title,
      roles: Array.isArray(row.roles) ? row.roles : [],
      attribute: row.attribute,
      imageUrl: row.image_url,
      iconUrl: row.icon_url,
    }));

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=600'
    );
    return res.status(200).json({ game: slug, total: heroes.length, heroes });
  } catch (err) {
    logger.error('[api/games/%s/heroes] internal error:', slug, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
