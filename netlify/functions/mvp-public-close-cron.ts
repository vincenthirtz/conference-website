// netlify/functions/mvp-public-close-cron.ts
// Netlify Scheduled Function — runs every 5 minutes (see netlify.toml) and
// POSTs to /api/cron/mvp-public-close with the CRON_SECRET.
//
// The endpoint (served by conference-api) closes and settles the public MVP
// polls whose effective deadline has passed — `closes_at` reached, or opened
// without a limit for more than 4 h — exactly like the staff « Clore »
// button: winner, TCG coins, Discord vote message edited, Twitch chat
// unsubscribed. Before it, nothing closed an expired poll.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';
import { cronBaseUrl } from './_lib/cronBaseUrl';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[mvp-public-close-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl = cronBaseUrl();
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/mvp-public-close`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

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
    if (!res.ok) {
      logger.error(
        '[mvp-public-close-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[mvp-public-close-cron] fetch %s:',
      aborted ? 'timed out after 20s' : 'error',
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
