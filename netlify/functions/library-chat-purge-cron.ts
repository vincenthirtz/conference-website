// netlify/functions/library-chat-purge-cron.ts
// Netlify Scheduled Function — une fois par jour (cf. netlify.toml), POST vers
// /api/cron/library-chat-purge avec le CRON_SECRET.
//
// L'endpoint (conference-api) applique la conservation du chat de la Women's
// Library : les messages de plus de 30 jours sont supprimés, et les sourdines
// échues depuis 30 jours (lot 6 de docs/PLAN-womens-library.md). Un message
// signalé survit dans la copie figée de son ticket.

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';
import { cronBaseUrl } from './_lib/cronBaseUrl';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[library-chat-purge-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl = cronBaseUrl();
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/library-chat-purge`;

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
        '[library-chat-purge-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[library-chat-purge-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[library-chat-purge-cron] fetch %s:',
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
