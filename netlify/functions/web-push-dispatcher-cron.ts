// netlify/functions/web-push-dispatcher-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/web-push-dispatch toutes
// les minutes pour fan-outer les events de bot_event_outbox vers les
// subscriptions Web Push du staff (PWA /admin).
//
// Le schedule est configuré dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL), NEXT_PUBLIC_VAPID_PUBLIC_KEY,
//   VAPID_PRIVATE_KEY, et optionnellement VAPID_SUBJECT.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[web-push-dispatcher-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/web-push-dispatch`;

  // Cap à 25s : le handler interne a un soft budget à 8s mais peut prendre
  // plus si beaucoup de subs / latence push service. Netlify scheduled
  // functions tolèrent jusqu'à 30s — on garde une marge.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

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
        '[web-push-dispatcher-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 400)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[web-push-dispatcher-cron] %s', text.slice(0, 800));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[web-push-dispatcher-cron] fetch %s:',
      aborted ? 'timed out after 25s' : 'error',
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
