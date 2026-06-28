// pages/api/cron/email-digest.ts
//
// Cron du DIGEST email (deux fois par jour). Délègue tout le travail à
// `runEmailDispatcher()` (utils/emailDispatcher.ts) : lecture de
// bot_event_outbox, résolution d'audience opt-IN, dedup via email_deliveries,
// agrégation par user, envoi Brevo. Cette route est uniquement la couche
// auth + invocation.
//
// Auth : header `Authorization: Bearer <CRON_SECRET>` ou query `?secret=<CRON_SECRET>`
// (identique aux autres routes /api/cron/*). Déclenché par la Netlify
// scheduled function `email-digest-cron` (cf. netlify.toml).

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { runEmailDispatcher } from '@/utils/emailDispatcher';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/email-digest] CRON_SECRET not configured — refusing');
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
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  try {
    const stats = await runEmailDispatcher();
    logger.info(
      '[cron/email-digest] done candidates=%d emailsSent=%d recipients=%d skipped=%d',
      stats.candidates,
      stats.emailsSent,
      stats.recipients,
      stats.skipped
    );
    return res.status(200).json({ success: true, ...stats });
  } catch (err) {
    logger.error('[cron/email-digest] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
