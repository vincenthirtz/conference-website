// pages/api/cron/broadcast-process.ts
// Cron quotidien : pour chaque campagne planifiée (status='scheduled'),
// envoie une vague de wave_size emails.
//
// Auth : header `Authorization: Bearer <CRON_SECRET>` ou query `?secret=<CRON_SECRET>`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { processCampaignWave } from '@/utils/broadcasts';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/broadcast] CRON_SECRET not configured — refusing');
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

  // Liste les campagnes éligibles
  const { data: schedules, error } = await supabaseAdmin
    .from('broadcast_schedules')
    .select('campaign_id')
    .eq('status', 'scheduled');

  if (error) {
    console.error('[cron/broadcast] schedules error:', error);
    return res.status(500).json({ error: 'Echec du chargement des plannings' });
  }

  const results: unknown[] = [];
  for (const row of schedules ?? []) {
    const campaignId = String((row as { campaign_id: string }).campaign_id);
    try {
      const result = await processCampaignWave(campaignId);
      results.push(result);
    } catch (err: unknown) {
      console.error(
        '[cron/broadcast] wave error for %s: %s',
        campaignId,
        (err as Error).message
      );
      results.push({ campaignId, error: (err as Error).message });
    }
  }

  return res.status(200).json({
    success: true,
    processed: results.length,
    results,
  });
}
