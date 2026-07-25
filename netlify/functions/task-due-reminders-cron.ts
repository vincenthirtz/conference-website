// netlify/functions/task-due-reminders-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/task-due-reminders une fois
// par jour pour rappeler (J-1) les cartes du Kanban interne dont l'échéance
// (`tasks.due_date`) tombe demain et qui ne sont pas dans une colonne terminale.
//
// Pour chaque carte éligible, l'endpoint émet un event `task.due_soon`
// (outbox → push/DM Discord via le bot). Réponse 200 { processed, emitted }.
//
// Le schedule est configuré dans netlify.toml (0 8 * * *). Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[task-due-reminders-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/task-due-reminders`;

  // Cap à 20s comme les autres crons : les DB ops (fetch + emit) doivent être
  // rapides. Protège le quota mensuel de function-seconds si l'upstream traîne.
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
        '[task-due-reminders-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[task-due-reminders-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[task-due-reminders-cron] fetch %s:',
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
