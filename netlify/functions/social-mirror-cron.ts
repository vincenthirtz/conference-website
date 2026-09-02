// netlify/functions/social-mirror-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/social-mirror toutes les
// 15 minutes pour recopier dans le salon Discord configuré ce que
// l'association publie ailleurs : posts Bluesky et vidéos YouTube.
//
// Quinze minutes, et pas une : ni un post ni une vidéo d'association n'ont
// d'urgence à la minute. Les deux flux se lisent sans authentification, donc
// chaque passage est gratuit en euros — mais pas en secondes de fonction.
//
// Le schedule est configuré dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[social-mirror-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/social-mirror`;

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
    const body = await res.text();
    if (!res.ok) {
      logger.error('[social-mirror-cron] upstream %s: %s', res.status, body);
      return { statusCode: 502, body };
    }
    logger.info('[social-mirror-cron] %s', body);
    return { statusCode: 200, body };
  } catch (err) {
    logger.error('[social-mirror-cron] fetch failed', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Cron trigger failed' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
