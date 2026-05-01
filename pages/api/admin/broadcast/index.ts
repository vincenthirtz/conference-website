// pages/api/admin/broadcast/index.ts
// Liste les campagnes broadcast et leurs statistiques cumulatives,
// reconstruites depuis staff_logs (entity_type='broadcast').

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { BROADCAST_CAMPAIGNS } from '@/utils/broadcasts';

import { logger } from '../../../../utils/logger';
type CampaignStats = {
  totalSent: number;
  totalFailed: number;
  lastRunAt: string | null;
  runsCount: number;
};

type CampaignSchedule = {
  waveSize: number;
  status: 'scheduled' | 'paused' | 'completed';
  lastWaveAt: string | null;
  totalRecipients: number;
  pending: number;
  sent: number;
  failed: number;
} | null;

type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  subject: string;
  status: string;
  audience: string;
  stats: CampaignStats;
  schedule: CampaignSchedule;
};

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  // Tire l'historique des envois broadcast (les 500 derniers, ordonné par date)
  const { data: logs, error } = await supabaseAdmin
    .from('staff_logs')
    .select('created_at, payload')
    .eq('entity_type', 'broadcast')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.error('[broadcast/index] staff_logs error:', error);
    return res.status(500).json({ error: 'Echec du chargement des stats' });
  }

  const statsByCampaign = new Map<string, CampaignStats>();

  for (const log of logs ?? []) {
    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const campaignId =
      typeof payload.campaign === 'string' ? payload.campaign : null;
    if (!campaignId) continue;

    const current = statsByCampaign.get(campaignId) ?? {
      totalSent: 0,
      totalFailed: 0,
      lastRunAt: null,
      runsCount: 0,
    };

    const sent = Number(payload.sent);
    const failed = Number(payload.failed);
    if (Number.isFinite(sent)) current.totalSent += sent;
    if (Number.isFinite(failed)) current.totalFailed += failed;
    current.runsCount += 1;
    if (
      !current.lastRunAt ||
      (typeof log.created_at === 'string' && log.created_at > current.lastRunAt)
    ) {
      current.lastRunAt = log.created_at as string;
    }

    statsByCampaign.set(campaignId, current);
  }

  // État des plannings de vagues + recipients en queue
  const campaignIds = BROADCAST_CAMPAIGNS.map((c) => c.id);
  const scheduleByCampaign = new Map<
    string,
    {
      waveSize: number;
      status: 'scheduled' | 'paused' | 'completed';
      lastWaveAt: string | null;
      totalRecipients: number;
    }
  >();
  const recipientCounts = new Map<
    string,
    { pending: number; sent: number; failed: number }
  >();

  if (campaignIds.length > 0) {
    const { data: schedules } = await supabaseAdmin
      .from('broadcast_schedules')
      .select('campaign_id, wave_size, status, last_wave_at, total_recipients')
      .in('campaign_id', campaignIds);

    for (const row of schedules ?? []) {
      scheduleByCampaign.set((row as any).campaign_id, {
        waveSize: (row as any).wave_size,
        status: (row as any).status,
        lastWaveAt: (row as any).last_wave_at ?? null,
        totalRecipients: (row as any).total_recipients ?? 0,
      });
    }

    const { data: recipients } = await supabaseAdmin
      .from('broadcast_recipients')
      .select('campaign_id, status')
      .in('campaign_id', campaignIds);

    for (const row of recipients ?? []) {
      const cid = (row as any).campaign_id as string;
      const s = (row as any).status as 'pending' | 'sent' | 'failed';
      const cur = recipientCounts.get(cid) ?? {
        pending: 0,
        sent: 0,
        failed: 0,
      };
      cur[s] = (cur[s] ?? 0) + 1;
      recipientCounts.set(cid, cur);
    }
  }

  const campaigns: CampaignSummary[] = BROADCAST_CAMPAIGNS.map((c) => {
    const sched = scheduleByCampaign.get(c.id);
    const counts = recipientCounts.get(c.id) ?? {
      pending: 0,
      sent: 0,
      failed: 0,
    };
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      subject: c.subject,
      status: c.status,
      audience: c.audience,
      stats: statsByCampaign.get(c.id) ?? {
        totalSent: 0,
        totalFailed: 0,
        lastRunAt: null,
        runsCount: 0,
      },
      schedule: sched
        ? {
            waveSize: sched.waveSize,
            status: sched.status,
            lastWaveAt: sched.lastWaveAt,
            totalRecipients: sched.totalRecipients,
            pending: counts.pending,
            sent: counts.sent,
            failed: counts.failed,
          }
        : null,
    };
  });

  return res.status(200).json({ campaigns });
}
