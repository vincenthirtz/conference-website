// netlify/functions/team-weekly-recap-cron.ts
// Netlify Scheduled Function — déclenche /api/cron/team-weekly-recap une fois
// par semaine (lundi matin : la semaine écoulée est close, la suivante se
// prépare).
//
// L'endpoint n'émet un event `team.weekly.recap` que pour les équipes dont la
// semaine a quelque chose à raconter, au plus une fois par équipe et par
// semaine. La livraison elle-même passe par les dispatchers existants (push
// opt-out, email opt-in) — ce cron ne notifie personne directement.
//
// Le schedule est configuré dans netlify.toml (0 9 * * 1). Env vars requises :
//   CRON_SECRET, URL (ou SITE_URL).

import type { Handler } from '@netlify/functions';

import { logger } from '../../utils/logger';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[team-weekly-recap-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/team-weekly-recap`;

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
        '[team-weekly-recap-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    logger.info('[team-weekly-recap-cron] processed: %s', text.slice(0, 200));
    return { statusCode: 200, body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    logger.error(
      '[team-weekly-recap-cron] fetch %s:',
      aborted ? 'timed out after 20s' : 'error',
      err
    );
    return {
      statusCode: aborted ? 504 : 502,
      body: JSON.stringify({ error: 'cron trigger failed' }),
    };
  } finally {
    clearTimeout(timeout);
  }
};
