// pages/api/admin/broadcast/[campaignId]/schedule.ts
// Gère la programmation par vagues d'une campagne broadcast.
//
// POST { waveSize: number }
//   Crée (ou met à jour) un planning pour la campagne et snapshote la liste
//   des destinataires éligibles dans broadcast_recipients (status='pending').
//   Si une planification existe déjà, met à jour wave_size + status='scheduled'
//   sans toucher aux recipients déjà envoyés.
//
// GET
//   Renvoie l'état actuel : status, wave_size, totaux pending/sent/failed,
//   last_wave_at.
//
// DELETE
//   Annule la planification : supprime la ligne broadcast_schedules + les
//   broadcast_recipients pending. Les recipients déjà envoyés sont conservés
//   en historique.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  computeAudienceRecipients,
  getCampaign,
  type CampaignAudience,
} from '@/utils/broadcasts';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const campaignId = String(req.query.campaignId ?? '');
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return res.status(404).json({ error: 'Campagne inconnue.' });
  }

  if (req.method === 'GET') {
    return handleGet(campaignId, res);
  }
  if (req.method === 'POST') {
    return handlePost(
      req,
      res,
      ctx,
      campaignId,
      campaign.audience,
      campaign.name
    );
  }
  if (req.method === 'DELETE') {
    return handleDelete(req, res, ctx, campaignId, campaign.name);
  }

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(campaignId: string, res: NextApiResponse) {
  const { data: schedule, error: schedErr } = await supabaseAdmin!
    .from('broadcast_schedules')
    .select(
      'campaign_id, wave_size, status, last_wave_at, total_recipients, created_at, updated_at'
    )
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (schedErr) {
    logger.error('[broadcast/schedule GET] schedule error:', schedErr);
    return res.status(500).json({ error: 'Echec du chargement du planning' });
  }

  // Compte les recipients par status
  const { data: counts, error: countErr } = await supabaseAdmin!
    .from('broadcast_recipients')
    .select('status', { count: 'exact', head: false })
    .eq('campaign_id', campaignId);

  if (countErr) {
    logger.error('[broadcast/schedule GET] counts error:', countErr);
    return res.status(500).json({ error: 'Echec du chargement des stats' });
  }

  const breakdown = { pending: 0, sent: 0, failed: 0 };
  for (const row of counts ?? []) {
    const s = (row as { status: string }).status;
    if (s === 'pending') breakdown.pending++;
    else if (s === 'sent') breakdown.sent++;
    else if (s === 'failed') breakdown.failed++;
  }

  return res.status(200).json({
    schedule: schedule ?? null,
    recipients: breakdown,
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  campaignId: string,
  audience: CampaignAudience,
  campaignName: string
) {
  const rawWaveSize = Number(req.body?.waveSize);
  if (!Number.isFinite(rawWaveSize) || rawWaveSize < 1 || rawWaveSize > 290) {
    return res.status(400).json({
      error: 'waveSize doit être un entier entre 1 et 290.',
    });
  }
  const waveSize = Math.floor(rawWaveSize);

  // 1) Calcule les destinataires éligibles
  let recipients;
  try {
    recipients = await computeAudienceRecipients(audience);
  } catch (err: unknown) {
    logger.error('[broadcast/schedule] recipients error:', err);
    return res.status(500).json({ error: 'Echec du calcul des destinataires' });
  }

  if (recipients.length === 0) {
    return res
      .status(400)
      .json({ error: 'Aucun destinataire éligible pour cette campagne.' });
  }

  // 2) Snapshot dans broadcast_recipients (insert ON CONFLICT DO NOTHING)
  // — préserve les statuts existants si une vague a déjà été envoyée
  const rows = recipients.map((r) => ({
    campaign_id: campaignId,
    user_id: r.user_id,
    email: r.email,
    label: r.label,
    status: 'pending' as const,
  }));

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error: insErr, count } = await supabaseAdmin!
      .from('broadcast_recipients')
      .upsert(slice, {
        onConflict: 'campaign_id,user_id',
        ignoreDuplicates: true,
        count: 'exact',
      });
    if (insErr) {
      logger.error('[broadcast/schedule] insert error:', insErr);
      return res.status(500).json({ error: 'Echec du snapshot recipients' });
    }
    inserted += count ?? 0;
  }

  // 3) Upsert le planning
  const { data: existing } = await supabaseAdmin!
    .from('broadcast_schedules')
    .select('campaign_id')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  const userId = ctx?.user?.id ?? null;

  const { error: upErr } = await supabaseAdmin!
    .from('broadcast_schedules')
    .upsert(
      {
        campaign_id: campaignId,
        wave_size: waveSize,
        status: 'scheduled',
        total_recipients: recipients.length,
        ...(existing ? {} : { created_by: userId }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id' }
    );

  if (upErr) {
    logger.error('[broadcast/schedule] upsert error:', upErr);
    return res.status(500).json({ error: 'Echec de la planification' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast_schedule',
        payload: {
          campaign: campaignId,
          campaign_name: campaignName,
          wave_size: waveSize,
          total_recipients: recipients.length,
          newly_inserted: inserted,
          mode: existing ? 'updated' : 'created',
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/schedule] log error:', logErr);
    }
  }

  return res.status(200).json({
    success: true,
    campaignId,
    waveSize,
    totalRecipients: recipients.length,
    newlyInserted: inserted,
  });
}

async function handleDelete(
  _req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  campaignId: string,
  campaignName: string
) {
  // Supprime les recipients pending (garde l'historique sent/failed)
  const { error: delRecErr, count: deletedRecipients } = await supabaseAdmin!
    .from('broadcast_recipients')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (delRecErr) {
    logger.error('[broadcast/schedule DELETE] recipients error:', delRecErr);
    return res.status(500).json({ error: 'Echec de la suppression' });
  }

  const { error: delSchedErr } = await supabaseAdmin!
    .from('broadcast_schedules')
    .delete()
    .eq('campaign_id', campaignId);

  if (delSchedErr) {
    logger.error('[broadcast/schedule DELETE] schedule error:', delSchedErr);
    return res.status(500).json({ error: 'Echec de la suppression' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast_schedule',
        payload: {
          campaign: campaignId,
          campaign_name: campaignName,
          mode: 'cancelled',
          deleted_pending: deletedRecipients ?? 0,
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/schedule DELETE] log error:', logErr);
    }
  }

  return res.status(200).json({
    success: true,
    campaignId,
    deletedPending: deletedRecipients ?? 0,
  });
}
