// netlify/functions/broadcast-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/broadcast-process une fois
// par jour pour traiter les vagues d'emails broadcast planifiées.
//
// Le schedule est configuré dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';
export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[broadcast-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/broadcast-process`;

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      logger.error(
        '[broadcast-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[broadcast-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    logger.error('[broadcast-cron] fetch error:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach app endpoint' }),
    };
  }
};
