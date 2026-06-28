// netlify/functions/email-digest-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/email-digest deux fois par
// jour pour envoyer le digest email des events bot_event_outbox aux users
// opt-IN. Le travail réel (audience, dedup, envoi Brevo) vit dans
// utils/emailDispatcher.ts.
//
// Le schedule est configuré dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL), BREVO_API_KEY, EMAIL_FROM.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[email-digest-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/email-digest`;

  // Cap à 20s : le dispatcher peut prendre du temps (résolution d'emails +
  // envois Brevo séquentiels). Netlify scheduled functions tolèrent jusqu'à
  // 30s — on garde une marge confortable.
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
        '[email-digest-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 400)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[email-digest-cron] %s', text.slice(0, 800));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[email-digest-cron] fetch %s:',
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
