// netlify/functions/scrim-planning-reminders-cron.ts
// Netlify Scheduled Function — runs a few times a day (see netlify.toml) and
// POSTs to /api/cron/scrim-planning-reminders with the CRON_SECRET.
//
// The endpoint scans every active tenant for OPEN scrim-planning grids whose
// horizon starts soon and where a team hasn't painted any slot yet, emits one
// `scrim.planning.reminder` outbox event per grid (push/email fanout to the two
// teams' captains/managers + staff), and stamps `reminder_pinged_at` so each
// grid is nudged at most once.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[scrim-planning-reminders-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/scrim-planning-reminders`;

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
        '[scrim-planning-reminders-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info(
      '[scrim-planning-reminders-cron] processed: %s',
      text.slice(0, 200)
    );
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[scrim-planning-reminders-cron] fetch %s:',
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
