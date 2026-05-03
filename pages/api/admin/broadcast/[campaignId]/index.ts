// pages/api/admin/broadcast/[campaignId]/index.ts
// Staff endpoint : déclenche l'envoi d'une campagne d'email broadcast.
//
// Body params (POST) :
//   testTo?: string   — envoi à une seule adresse (preview), prioritaire
//   dryRun?: boolean  — si true, calcule les destinataires sans envoyer
//   limit?:  number   — cap d'envois pour cet appel (Brevo gratuit = 300/jour)
//   offset?: number   — saute les N premiers utilisateurs (rollout par batch)
//
// Pour un envoi étalé dans le temps, voir /schedule (vagues quotidiennes).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { computeAudienceRecipients, getCampaign } from '@/utils/broadcasts';

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
  if (campaign.status === 'archived') {
    return res.status(400).json({ error: 'Campagne archivée.' });
  }

  // Mode test : envoi à une seule adresse pour preview
  const testTo =
    typeof req.body?.testTo === 'string' ? req.body.testTo.trim() : null;
  if (testTo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }
    const testLabel =
      typeof req.body?.testLabel === 'string'
        ? req.body.testLabel.trim() || null
        : null;
    try {
      const result = await campaign.send(testTo, testLabel);
      return res.status(200).json({
        success: result.success,
        test: true,
        campaignId,
        to: testTo,
        error: result.error,
        id: result.id,
      });
    } catch (err: unknown) {
      return res
        .status(500)
        .json({ success: false, error: (err as Error).message });
    }
  }

  const dryRun = Boolean(req.body?.dryRun);
  const rawLimit = Number(req.body?.limit);
  const rawOffset = Number(req.body?.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : null;
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  let recipients;
  try {
    recipients = await computeAudienceRecipients(campaign.audience);
  } catch (err: unknown) {
    logger.error('[broadcast] computeAudienceRecipients error:', err);
    return res.status(500).json({ error: 'Echec du chargement des comptes' });
  }

  const windowed = recipients.slice(
    offset,
    limit != null ? offset + limit : undefined
  );

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      campaignId,
      totalConfirmedUsers: recipients.length,
      windowSize: windowed.length,
      offset,
      limit,
      withLabel: windowed.filter((r) => !!r.label).length,
      withoutLabel: windowed.filter((r) => !r.label).length,
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of windowed) {
    try {
      const result = await campaign.send(r.email, r.label);
      if (result.success) {
        sent++;
      } else {
        failed++;
        if (errors.length < 20) {
          errors.push(`${r.email}: ${result.error ?? 'unknown error'}`);
        }
      }
    } catch (err: unknown) {
      failed++;
      if (errors.length < 20) {
        errors.push(`${r.email}: ${(err as Error).message}`);
      }
    }
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
          total_confirmed_users: recipients.length,
          window_size: windowed.length,
          offset,
          limit,
          sent,
          failed,
          mode: 'manual',
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (logErr) {
      logger.error('[broadcast] log error:', logErr);
    }
  }

  return res.status(200).json({
    success: true,
    campaignId,
    totalConfirmedUsers: recipients.length,
    windowSize: windowed.length,
    offset,
    limit,
    sent,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
