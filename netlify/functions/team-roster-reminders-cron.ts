// netlify/functions/team-roster-reminders-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/team-roster-reminders une
// fois par jour. L'endpoint n'envoie réellement qu'aux jalons J-21/14/7/3/1
// avant la deadline de verrouillage des rosters ; les autres jours il répond
// 200 { skipped: 'not_a_milestone' } sans rien poster.
//
// Chaque équipe concernée reçoit un message personnalisé dans SON salon
// textuel Discord (event `team.message` → outbox → bot).
//
// Le schedule est configuré dans netlify.toml (0 9 * * *). Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[team-roster-reminders-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/team-roster-reminders`;

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
        '[team-roster-reminders-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info(
      '[team-roster-reminders-cron] processed: %s',
      text.slice(0, 200)
    );
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[team-roster-reminders-cron] fetch %s:',
      aborted ? 'timed out after 20s' : 'error',
      err
    );
    return {
      statusCode: aborted ? 504 : 502,
      body: JSON.stringify({ error: 'cron trigger failed' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
