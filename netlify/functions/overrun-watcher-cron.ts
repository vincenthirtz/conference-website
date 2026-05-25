// netlify/functions/overrun-watcher-cron.ts
//
// Netlify Scheduled Function — declenche /api/cron/overrun-check toutes les
// 2 minutes pour escalader les segments live en overrun >= 5min (cross-tenant).
// C'est le fallback server-side du hook client `useOverrunWatcher` : si
// l'onglet Director est ferme, ce cron prend le relais.
//
// Le schedule est configure dans netlify.toml. Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).
//
// Thin wrapper : toute la logique vit dans le handler Next.js — ce fichier
// se contente d'authentifier l'appel via Bearer CRON_SECRET et de poser un
// hard timeout AbortController (protection quota function-seconds, cf.
// netlify CLAUDE.md).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[overrun-watcher-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/overrun-check`;

  // Cap a 25s. Le handler interne a un soft budget a 20s ; on garde 5s de
  // marge pour la stack reseau + flush des logs. Netlify scheduled functions
  // tolerent jusqu'a 30s.
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
        '[overrun-watcher-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 400)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[overrun-watcher-cron] %s', text.slice(0, 800));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[overrun-watcher-cron] fetch %s:',
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
