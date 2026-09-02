// netlify/functions/social-token-refresh-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/social-token-refresh une
// fois par jour pour rafraîchir les jetons longue durée des comptes réseaux
// (Instagram) AVANT leur échéance.
//
// Le jeton Instagram meurt au bout de ~60 jours et ne se rafraîchit qu'avec un
// jeton encore valide : passé la date, la seule issue est de re-cliquer le
// consentement à la main. Le cron s'y prend dix jours à l'avance, donc dix
// occasions de réussir avant que ce soit irréversible.
//
// Le schedule est configuré dans netlify.toml (0 6 * * *). Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[social-token-refresh-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/social-token-refresh`;

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
      logger.error('[social-token-refresh-cron] upstream %s: %s', res.status, body);
      return { statusCode: 502, body };
    }
    logger.info('[social-token-refresh-cron] %s', body);
    return { statusCode: 200, body };
  } catch (err) {
    logger.error('[social-token-refresh-cron] fetch failed', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Cron trigger failed' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
