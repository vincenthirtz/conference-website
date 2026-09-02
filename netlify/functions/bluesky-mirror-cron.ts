// netlify/functions/bluesky-mirror-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/bluesky-mirror toutes les
// 15 minutes pour recopier les nouveaux posts Bluesky de l'association dans le
// salon Discord configuré.
//
// Quinze minutes, et pas une : un post d'association n'a pas d'urgence à la
// minute, et le fil se lit sans authentification donc chaque passage est un
// appel réseau gratuit mais pas gratuit en secondes de fonction.
//
// Le schedule est configuré dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[bluesky-mirror-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/bluesky-mirror`;

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
      logger.error('[bluesky-mirror-cron] upstream %s: %s', res.status, body);
      return { statusCode: 502, body };
    }
    logger.info('[bluesky-mirror-cron] %s', body);
    return { statusCode: 200, body };
  } catch (err) {
    logger.error('[bluesky-mirror-cron] fetch failed', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Cron trigger failed' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
