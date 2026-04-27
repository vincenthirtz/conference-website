// netlify/functions/checkin-cron.ts
// Netlify Scheduled Function — runs every 5 minutes and POSTs to the
// internal /api/cron/checkin-process endpoint with the CRON_SECRET.
//
// The schedule is configured in netlify.toml. Make sure the env vars
// CRON_SECRET and URL (or SITE_URL) are set in the Netlify dashboard.

import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[checkin-cron] CRON_SECRET not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'CRON_SECRET not configured' }),
    };
  }

  const baseUrl =
    process.env.URL || process.env.SITE_URL || 'https://owwomenscup.fr';
  const target = `${baseUrl.replace(/\/$/, '')}/api/cron/checkin-process`;

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.error(
        '[checkin-cron] non-OK response: %d %s',
        res.status,
        text.slice(0, 200)
      );
      return {
        statusCode: res.status,
        body: text || JSON.stringify({ error: 'upstream error' }),
      };
    }

    console.log('[checkin-cron] processed: %s', text.slice(0, 200));
    return {
      statusCode: 200,
      body: text,
    };
  } catch (err) {
    console.error('[checkin-cron] fetch error:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach app endpoint' }),
    };
  }
};
