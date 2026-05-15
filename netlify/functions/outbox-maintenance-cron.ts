// netlify/functions/outbox-maintenance-cron.ts
// Netlify Scheduled Function — declenche /api/cron/outbox-maintenance toutes
// les heures pour :
//   - marquer les events 'pending' trop vieux comme 'failed' (poison-pill)
//   - purger les rows 'delivered'/'failed' > N jours
//   - logger un snapshot d'observabilite (compteurs + latence p50/p95)
//
// Le schedule est configure dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).
//
// Le body JSON renvoye par l'endpoint est logge ici a chaque tick — c'est la
// seule source d'historique (Netlify retient les logs sur ~7j). Si on veut un
// historique plus long, faire une table audit cote DB plus tard.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[outbox-maintenance-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/outbox-maintenance`;

  // Cap a 20s comme les autres crons : DB ops doivent etre rapides (indexees).
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
        '[outbox-maintenance-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 400)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    // Stats inline dans les logs Netlify — grepable.
    logger.info('[outbox-maintenance-cron] %s', text.slice(0, 800));
    return { statusCode: 200, body: text };
  } catch (err) {
    logger.error('[outbox-maintenance-cron] fetch error:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach app endpoint' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
