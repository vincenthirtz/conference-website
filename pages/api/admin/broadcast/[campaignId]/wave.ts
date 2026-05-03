// pages/api/admin/broadcast/[campaignId]/wave.ts
// Déclenche manuellement la prochaine vague d'une campagne planifiée.
// Utile pour tester la cadence ou rattraper un retard sans attendre le cron.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { getCampaign, processCampaignWave } from '@/utils/broadcasts';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const campaignId = String(req.query.campaignId ?? '');
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    return res.status(404).json({ error: 'Campagne inconnue.' });
  }

  let result;
  try {
    result = await processCampaignWave(campaignId);
  } catch (err: unknown) {
    logger.error('[broadcast/wave] error:', err);
    return res.status(500).json({ error: (err as Error).message });
  }

  if (!result) {
    return res
      .status(400)
      .json({ error: 'Aucun planning actif pour cette campagne.' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast',
        payload: {
          campaign: campaignId,
          campaign_name: campaign.name,
          mode: 'wave-manual',
          attempted: result.attempted,
          sent: result.sent,
          failed: result.failed,
          remaining_pending: result.remainingPending,
          new_status: result.status,
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/wave] log error:', logErr);
    }
  }

  return res.status(200).json({ success: true, ...result });
}
