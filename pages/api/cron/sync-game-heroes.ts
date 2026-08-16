// pages/api/cron/sync-game-heroes.ts
// Scheduled processor that syncs the global LoL + Dota 2 hero pool into
// public.game_heroes. Triggered once per day by the Netlify scheduled
// function netlify/functions/sync-game-heroes-cron.ts.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>` OR query `?secret=<CRON_SECRET>`.
// Method: POST (preferred) or GET (manual trigger from a browser/curl).

import type { NextApiRequest, NextApiResponse } from 'next';
import { syncAllGameHeroes } from '@/utils/gameHeroesSync';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '../../../utils/logger';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error(
      '[cron/sync-game-heroes] CRON_SECRET not configured — refusing'
    );
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const querySecret = req.query.secret;
  if (typeof querySecret === 'string' && querySecret === secret) return true;
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const summary = await syncAllGameHeroes();

    for (const game of summary.games) {
      if (game.ok) {
        logger.info(
          '[cron/sync-game-heroes] %s ok fetched=%d upserted=%d',
          game.game,
          game.fetched,
          game.upserted
        );
      } else {
        logger.error(
          '[cron/sync-game-heroes] %s failed: %s',
          game.game,
          game.error ?? 'unknown'
        );
      }
    }

    // Heartbeat for the mega-dashboard, matching the convention used by the
    // other crons (see pages/api/cron/checkin-process.ts).
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('site_settings').upsert(
          {
            key: 'last_cron_sync_game_heroes_at',
            value: summary.finishedAt,
            description:
              'ISO timestamp du dernier passage du cron /api/cron/sync-game-heroes (heartbeat dashboard).',
          },
          { onConflict: 'key' }
        );
      } catch (e) {
        logger.error('[cron/sync-game-heroes] heartbeat write error:', e);
      }
    }

    const anyFailure = summary.games.some((g) => !g.ok);
    return res.status(anyFailure ? 207 : 200).json({
      success: !anyFailure,
      ...summary,
    });
  } catch (err) {
    logger.error('[cron/sync-game-heroes] error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: String(err) });
  }
}
