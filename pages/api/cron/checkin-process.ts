// pages/api/cron/checkin-process.ts
// Scheduled processor for the per-match check-in flow.
// Triggered every ~5 minutes by a Netlify Scheduled Function.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>` OR query `?secret=<CRON_SECRET>`.
// Returns a summary of what was processed.

import type { NextApiRequest, NextApiResponse } from 'next';
import { processCheckinForUpcomingMatches } from '@/utils/checkin';
import { supabaseAdmin } from '@/utils/supabase';

import { logger } from '../../../utils/logger';
export const config = {
  api: {
    // Cron jobs may run for a few seconds when there are many matches in the
    // window (each one does an email + Discord webhook).
    bodyParser: { sizeLimit: '1mb' },
  },
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // If no secret is configured, refuse rather than running unauthenticated
    logger.error('[cron/checkin] CRON_SECRET not configured — refusing');
    return false;
  }

  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = req.query.secret;
  if (typeof querySecret === 'string' && querySecret === secret) return true;

  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const summary = await processCheckinForUpcomingMatches();
    logger.info(
      '[cron/checkin] scanned=%d acted=%d errors=%d',
      summary.scanned,
      summary.acted,
      summary.errors
    );

    // Heartbeat : on note la dernière exécution dans site_settings pour que
    // le mega-dashboard puisse afficher "il y a X min" et alerter si > 60 min.
    if (supabaseAdmin) {
      try {
        const nowIso = new Date().toISOString();
        await supabaseAdmin.from('site_settings').upsert(
          {
            key: 'last_cron_checkin_at',
            value: nowIso,
            description:
              'ISO timestamp du dernier passage du cron /api/cron/checkin-process (heartbeat dashboard).',
          },
          { onConflict: 'key' }
        );
      } catch (e) {
        logger.error('[cron/checkin] heartbeat write error:', e);
      }
    }

    return res.status(200).json({
      success: true,
      ...summary,
    });
  } catch (err) {
    logger.error('[cron/checkin] error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: String(err) });
  }
}
