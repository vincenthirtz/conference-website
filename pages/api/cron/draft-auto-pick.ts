// pages/api/cron/draft-auto-pick.ts
// Scheduled processor that auto-picks the current step of any in_progress
// MOBA draft whose `deadline_at` is in the past. Triggered every minute by
// the Netlify scheduled function netlify/functions/draft-auto-pick-cron.ts.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>` OR query `?secret=...`.
// Method: POST (preferred) or GET (manual trigger from curl/browser).

import type { NextApiRequest, NextApiResponse } from 'next';
import { runDraftAutoPickTick } from '@/utils/draftEngine';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '../../../utils/logger';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error(
      '[cron/draft-auto-pick] CRON_SECRET not configured — refusing'
    );
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
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
    const summary = await runDraftAutoPickTick();

    logger.info(
      '[cron/draft-auto-pick] scanned=%d autoPicked=%d errors=%d',
      summary.scanned,
      summary.autoPicked,
      summary.errors
    );

    // Heartbeat for the mega-dashboard, matching other crons.
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('site_settings').upsert(
          {
            // Heartbeat rattaché au tenant par défaut (lot A8) : les crons ne
            // sont pas encore multi-tenant, et un upsert sans `tenant_id`
            // violerait la clé primaire `(tenant_id, key)`.
            tenant_id: DEFAULT_TENANT_ID,
            key: 'last_cron_draft_auto_pick_at',
            value: new Date().toISOString(),
            description:
              'ISO timestamp du dernier passage du cron /api/cron/draft-auto-pick (heartbeat dashboard).',
          },
          { onConflict: 'tenant_id,key' }
        );
      } catch (e) {
        logger.error('[cron/draft-auto-pick] heartbeat write error:', e);
      }
    }

    return res.status(200).json({
      success: summary.errors === 0,
      scanned: summary.scanned,
      autoPicked: summary.autoPicked,
      errors: summary.errors,
    });
  } catch (err) {
    logger.error('[cron/draft-auto-pick] error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: String(err) });
  }
}
