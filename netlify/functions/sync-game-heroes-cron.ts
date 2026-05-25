// netlify/functions/sync-game-heroes-cron.ts
// Netlify Scheduled Function — runs once per day and POSTs to the internal
// /api/cron/sync-game-heroes endpoint with the CRON_SECRET so the global
// hero pool (LoL champions via Data Dragon + Dota 2 heroes via OpenDota)
// stays in sync with the upstream sources.
//
// The schedule is configured in netlify.toml. Make sure the env vars
// CRON_SECRET and URL (or SITE_URL) are set in the Netlify dashboard.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[sync-game-heroes-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/sync-game-heroes`;

  // Two upstream APIs + DB upsert of ~340 rows total. Leave a generous
  // window but still cap below Netlify's scheduled-function ceiling.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');
    // 207 = partial success (one source failed). Surface but don't treat as fatal.
    if (!res.ok && res.status !== 207) {
      logger.error(
        '[sync-game-heroes-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[sync-game-heroes-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[sync-game-heroes-cron] fetch %s:',
      aborted ? 'timed out after 60s' : 'error',
      err
    );
    return {
      statusCode: aborted ? 504 : 502,
      body: JSON.stringify({
        error: aborted ? 'Upstream timeout' : 'Failed to reach app endpoint',
      }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
