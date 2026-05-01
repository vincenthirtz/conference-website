// netlify/functions/checkin-cron.ts
// Netlify Scheduled Function — runs every 5 minutes and POSTs to the
// internal /api/cron/checkin-process endpoint with the CRON_SECRET.
//
// The schedule is configured in netlify.toml. Make sure the env vars
// CRON_SECRET and URL (or SITE_URL) are set in the Netlify dashboard.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';
export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[checkin-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/checkin-process`;

  // Cap each invocation well under Netlify's scheduled-function ceiling so a
  // slow upstream cannot drain the monthly function-seconds quota (cron fires
  // every 5 minutes, ~8.6k invocations/month).
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
        '[checkin-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[checkin-cron] processed: %s', text.slice(0, 200));
    return {
      statusCode: 200,
      body: text,
    };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[checkin-cron] fetch %s:',
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
