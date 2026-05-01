// utils/broadcasts.ts
// Catalogue des campagnes d'emails broadcast déclenchables depuis l'admin.
// Pour ajouter une campagne :
//   1. Créer la fonction d'envoi dans utils/email.ts
//   2. Ajouter une entrée dans BROADCAST_CAMPAIGNS ci-dessous
// Le `staff_logs` payload tag (entity_type='broadcast', campaign=<id>) sert
// à reconstruire l'historique d'envoi pour le tableau de bord admin.

import { supabaseAdmin } from './supabase';
import {
  buildIdahobitLiveEmailHtml,
  sendIdahobitLiveEmail,
} from './email';
import type { SendEmailResult } from './email';

export type CampaignAudience = 'all-confirmed-users';
export type CampaignStatus = 'active' | 'draft' | 'archived';

export type BroadcastCampaign = {
  id: string;
  name: string;
  description: string;
  subject: string;
  audience: CampaignAudience;
  status: CampaignStatus;
  /** Envoi réel via Brevo */
  send: (to: string, label: string | null) => Promise<SendEmailResult>;
  /** Génère le HTML rendu (utilisé pour le live preview admin) */
  buildHtml: (label: string | null) => string;
};

export const BROADCAST_CAMPAIGNS: BroadcastCampaign[] = [
  {
    id: 'idahobit-live-2026',
    name: 'Live Twitch — IDAHOBIT 2026',
    description:
      'Annonce du live Twitch du dimanche 17 mai 2026 à 14h pour la Journée mondiale contre l’homophobie, la transphobie et la biphobie.',
    subject:
      'Live Twitch — Journée internationale contre les LGBTphobies, dimanche 17 mai à 14h',
    audience: 'all-confirmed-users',
    status: 'active',
    send: sendIdahobitLiveEmail,
    buildHtml: buildIdahobitLiveEmailHtml,
  },
];

export function getCampaign(id: string): BroadcastCampaign | undefined {
  return BROADCAST_CAMPAIGNS.find((c) => c.id === id);
}

export type ComputedRecipient = {
  user_id: string;
  email: string;
  label: string | null;
};

/**
 * Calcule la liste des destinataires éligibles pour une audience donnée.
 * - Itère auth.users (paginé), filtre les comptes confirmés
 * - Récupère profiles.battle_tag pour le greeting (split sur "#")
 * - Fallback sur user_metadata.display_name puis null
 */
export async function computeAudienceRecipients(
  audience: CampaignAudience
): Promise<ComputedRecipient[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  if (audience !== 'all-confirmed-users') {
    throw new Error(`Unsupported audience: ${audience}`);
  }

  const allUsers: { id: string; email: string; display_name: string | null }[] =
    [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (!u.email) continue;
      if (!u.email_confirmed_at && !u.confirmed_at) continue;
      allUsers.push({
        id: u.id,
        email: u.email,
        display_name:
          (u.user_metadata?.display_name as string | undefined) ?? null,
      });
    }
    if (batch.length < perPage) break;
    page += 1;
  }

  const userIds = allUsers.map((u) => u.id);
  const battleTagById = new Map<string, string>();
  const CHUNK = 500;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, battle_tag')
      .in('id', slice);
    if (profiles) {
      for (const p of profiles) {
        if (p.id && p.battle_tag) {
          battleTagById.set(p.id as string, p.battle_tag as string);
        }
      }
    }
  }

  return allUsers.map((u) => {
    const battleTag = battleTagById.get(u.id);
    let label: string | null = null;
    if (battleTag) {
      label = battleTag.split('#')[0]?.trim() || battleTag;
    } else if (u.display_name) {
      label = u.display_name.trim() || null;
    }
    return { user_id: u.id, email: u.email, label };
  });
}

export type WaveResult = {
  campaignId: string;
  status: 'scheduled' | 'completed' | 'paused' | 'idle';
  waveSize: number;
  attempted: number;
  sent: number;
  failed: number;
  remainingPending: number;
};

/**
 * Traite la prochaine vague d'une campagne planifiée :
 * - lit broadcast_schedules pour vérifier que la campagne est 'scheduled'
 * - tire wave_size recipients pending (FIFO sur created_at)
 * - envoie chaque email, marque sent/failed dans broadcast_recipients
 * - met à jour last_wave_at, et passe le status à 'completed' s'il n'y a
 *   plus de pending
 *
 * Retourne null si la campagne n'a pas de planning actif (skipped sans erreur).
 */
export async function processCampaignWave(
  campaignId: string
): Promise<WaveResult | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not configured');
  }
  const campaign = getCampaign(campaignId);
  if (!campaign) {
    throw new Error(`Unknown campaign: ${campaignId}`);
  }

  const { data: schedule, error: schedErr } = await supabaseAdmin
    .from('broadcast_schedules')
    .select('campaign_id, wave_size, status')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (schedErr) throw schedErr;
  if (!schedule) return null;
  if (schedule.status !== 'scheduled') {
    return {
      campaignId,
      status: schedule.status as WaveResult['status'],
      waveSize: schedule.wave_size,
      attempted: 0,
      sent: 0,
      failed: 0,
      remainingPending: 0,
    };
  }

  const waveSize = schedule.wave_size as number;

  const { data: pending, error: pendErr } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('user_id, email, label')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(waveSize);

  if (pendErr) throw pendErr;

  let sent = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const r of pending ?? []) {
    let success = false;
    let errorMsg: string | null = null;
    try {
      const result = await campaign.send(
        r.email as string,
        (r.label as string | null) ?? null
      );
      success = result.success;
      if (!success) errorMsg = result.error ?? 'unknown error';
    } catch (err: unknown) {
      errorMsg = (err as Error).message;
    }

    const { error: updErr } = await supabaseAdmin
      .from('broadcast_recipients')
      .update({
        status: success ? 'sent' : 'failed',
        sent_at: nowIso,
        error: errorMsg,
      })
      .eq('campaign_id', campaignId)
      .eq('user_id', r.user_id as string);

    if (updErr) {
      console.error('[broadcast/wave] update recipient error:', updErr);
    }

    if (success) sent++;
    else failed++;
  }

  // Compte les pending restants pour décider du status final
  const { count: remainingPending } = await supabaseAdmin
    .from('broadcast_recipients')
    .select('user_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  const newStatus: 'scheduled' | 'completed' =
    (remainingPending ?? 0) > 0 ? 'scheduled' : 'completed';

  await supabaseAdmin
    .from('broadcast_schedules')
    .update({
      status: newStatus,
      last_wave_at: nowIso,
      updated_at: nowIso,
    })
    .eq('campaign_id', campaignId);

  return {
    campaignId,
    status: newStatus,
    waveSize,
    attempted: pending?.length ?? 0,
    sent,
    failed,
    remainingPending: remainingPending ?? 0,
  };
}
