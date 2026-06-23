// pages/api/admin/broadcast/index.ts
// Liste paginée des campagnes broadcast et leurs statistiques cumulatives.
//
// - GET : page de campagnes (parmi BROADCAST_CAMPAIGNS, source de vérité),
//   avec stats reconstruites depuis staff_logs (entity_type='broadcast') et
//   l'état des plannings de vagues — agrégés UNIQUEMENT pour les campaign_ids
//   de la page courante (jamais tout l'historique / tous les recipients).
//
// Query params :
//   - limit?: number (default 25)
//   - offset?: number (default 0)
//
// Réponse :
// {
//   campaigns: CampaignSummary[],
//   total: number   // nombre total de campagnes déclarées
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { BROADCAST_CAMPAIGNS } from '@/utils/broadcasts';
import { parsePagination } from '@/utils/apiHelpers';

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

type BroadcastResponse =
  | { campaigns: CampaignSummary[]; total: number }
  | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BroadcastResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  // La liste des campagnes est statique (source de vérité = utils/broadcasts.ts).
  // On pagine cette liste, puis on n'agrège QUE pour les ids de la page.
  const total = BROADCAST_CAMPAIGNS.length;
  const { limit, offset } = parsePagination(req, { limit: 25 });
  const pageCampaigns = BROADCAST_CAMPAIGNS.slice(offset, offset + limit);
  const pageIds = pageCampaigns.map((c) => c.id);

  if (pageIds.length === 0) {
    return res.status(200).json({ campaigns: [], total });
  }

  const statsByCampaign = new Map<string, CampaignStats>();
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

  // 1) Stats cumulatives depuis staff_logs (entity_type='broadcast').
  //    Contraint au tenant ET aux campagnes de la page via payload->>campaign,
  //    borné à 500 logs récents (l'historique broadcast reste peu volumineux).
  //    staff_logs est tenant-scoped (cf. pages/api/admin/logs.ts).
  const { data: logs, error: logsErr } = await supabaseAdmin
    .from('staff_logs')
    .select('created_at, payload')
    .eq('tenant_id', ctx.tenantId)
    .eq('entity_type', 'broadcast')
    .in('payload->>campaign', pageIds)
    .order('created_at', { ascending: false })
    .limit(500);

  if (logsErr) {
    logger.error('[broadcast/index] staff_logs error:', logsErr);
    return res.status(500).json({ error: 'Echec du chargement des stats' });
  }

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

  // 2) Plannings de vagues : colonnes explicites, contraint aux ids de la page.
  //    broadcast_schedules n'a PAS de tenant_id (PK = campaign_id) — scoping
  //    par campaign_id uniquement, comme les routes schedule.ts / wave.ts.
  const { data: schedules, error: schedErr } = await supabaseAdmin
    .from('broadcast_schedules')
    .select('campaign_id, wave_size, status, last_wave_at, total_recipients')
    .in('campaign_id', pageIds);

  if (schedErr) {
    logger.error('[broadcast/index] broadcast_schedules error:', schedErr);
    return res.status(500).json({ error: 'Echec du chargement des plannings' });
  }

  for (const row of schedules ?? []) {
    scheduleByCampaign.set((row as any).campaign_id, {
      waveSize: (row as any).wave_size,
      status: (row as any).status,
      lastWaveAt: (row as any).last_wave_at ?? null,
      totalRecipients: (row as any).total_recipients ?? 0,
    });
  }

  // 3) Compteurs de recipients par campagne+statut.
  //    Une head-query count par (campagne, statut) éviterait de matérialiser
  //    des lignes mais multiplierait les round-trips (pageIds × 3). PostgREST
  //    n'expose pas de GROUP BY ici, donc on récupère une SEULE colonne étroite
  //    (campaign_id, status), bornée aux ids de la page, et on agrège en JS.
  //    broadcast_recipients n'a PAS de tenant_id (PK = campaign_id, user_id).
  const { data: recipients, error: recErr } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('campaign_id, status')
    .in('campaign_id', pageIds);

  if (recErr) {
    logger.error('[broadcast/index] broadcast_recipients error:', recErr);
    return res
      .status(500)
      .json({ error: 'Echec du chargement des destinataires' });
  }

  for (const row of recipients ?? []) {
    const cid = (row as any).campaign_id as string;
    const s = (row as any).status as 'pending' | 'sent' | 'failed';
    const cur = recipientCounts.get(cid) ?? {
      pending: 0,
      sent: 0,
      failed: 0,
    };
    if (s === 'pending' || s === 'sent' || s === 'failed') {
      cur[s] = (cur[s] ?? 0) + 1;
    }
    recipientCounts.set(cid, cur);
  }

  const campaigns: CampaignSummary[] = pageCampaigns.map((c) => {
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

  return res.status(200).json({ campaigns, total });
}
