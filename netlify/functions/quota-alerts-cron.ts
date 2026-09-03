// netlify/functions/quota-alerts-cron.ts
// Netlify Scheduled Function — une fois par jour (cf. netlify.toml) : appelle
// /api/cron/quota-alerts avec le CRON_SECRET.
//
// Un espace qui approche son quota d'API mensuel doit l'apprendre par un email,
// pas par des 429 en pleine journée de matchs. Deux seuils, une fois chacun par
// mois : 80 % et 100 %.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[quota-alerts-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/quota-alerts`;

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
        '[quota-alerts-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[quota-alerts-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[quota-alerts-cron] fetch %s:',
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
