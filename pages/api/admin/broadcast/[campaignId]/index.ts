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
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  computeAudienceRecipients,
  computeNewRecipients,
  computeUnsentRecipients,
  recordSentRecipients,
  getCampaign,
  buildBroadcastUnsubscribeUrl,
  buildRecipientUnsubscribeUrl,
  type BroadcastCampaign,
  type ComputedRecipient,
  type NewRecipientsResult,
  type UnsentRecipientsResult,
} from '@/utils/broadcasts';
import { campaignInputSchema } from '@/utils/campaignSchema';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const campaignId = String(req.query.campaignId ?? '');
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return res.status(404).json({ error: 'Campagne inconnue.' });
  }

  // Édition / suppression : campagnes DB uniquement (les builtin sont figées).
  if (req.method === 'PATCH') {
    return handleUpdate(req, res, ctx, campaign);
  }
  if (req.method === 'DELETE') {
    return handleDelete(req, res, ctx, campaign);
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ─── POST = envoi (test / dry-run / broadcast) ───
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
      // Cohérence RGPD : même un envoi de test porte un lien de désinscription
      // fonctionnel. Le staff identifié (ctx.user) sert de sujet du token user.
      const testUnsubscribeUrl = ctx?.user?.id
        ? buildBroadcastUnsubscribeUrl(ctx.user.id)
        : undefined;
      const result = await campaign.send(testTo, testLabel, testUnsubscribeUrl);
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
  // onlyNew : ne cibler que les « nouveaux inscrits » — destinataires de
  // l'audience actuelle jamais encore adressés pour cette campagne (diff sur
  // broadcast_recipients `sent`). Sert le renvoi après de nouvelles inscriptions.
  const onlyNew = Boolean(req.body?.onlyNew);
  // onlyUnsent : diff PAR IDENTITÉ contre les envois déjà tracés. Sert le cas
  // « j'ai changé l'audience » — les personnes qui entrent ont des comptes
  // anciens, donc `onlyNew` (filtre daté) les écarte toutes et annonce zéro.
  const onlyUnsent = Boolean(req.body?.onlyUnsent);
  // Reconnaissance explicite qu'un envoi passé n'a laissé aucune trace : sans
  // elle, on refuse plutôt que de réexpédier la campagne à tout le monde en
  // croyant n'écrire qu'aux nouveaux.
  const acknowledgeUntraced = Boolean(req.body?.acknowledgeUntraced);
  const rawLimit = Number(req.body?.limit);
  const rawOffset = Number(req.body?.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : null;
  const offset =
    Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  let recipients: ComputedRecipient[];
  let newMeta: NewRecipientsResult | null = null;
  let unsentMeta: UnsentRecipientsResult | null = null;
  try {
    if (onlyUnsent) {
      unsentMeta = await computeUnsentRecipients(campaignId, campaign.audience);
      recipients = unsentMeta.unsentRecipients;
    } else if (onlyNew) {
      newMeta = await computeNewRecipients(campaignId, campaign.audience);
      recipients = newMeta.newRecipients;
    } else {
      recipients = await computeAudienceRecipients(campaign.audience);
    }
  } catch (err: unknown) {
    logger.error('[broadcast] computeAudienceRecipients error:', err);
    return res.status(500).json({ error: 'Echec du chargement des comptes' });
  }

  // Envoi RÉEL sur un diff qui ne peut pas diffé : refus. En aperçu (dryRun)
  // on laisse passer — c'est justement là que l'écran doit pouvoir montrer le
  // problème et proposer de le reconnaître.
  if (
    onlyUnsent &&
    !dryRun &&
    unsentMeta?.untracedPreviousSend &&
    !acknowledgeUntraced
  ) {
    return res.status(409).json({
      error:
        'Cette campagne a déjà été envoyée sans trace par destinataire : le diff ne peut pas distinguer qui a reçu quoi. Confirme pour envoyer à toute l’audience.',
      code: 'UNTRACED_PREVIOUS_SEND',
      audienceTotal: unsentMeta.audienceTotal,
      lastSentAt: unsentMeta.lastSentAt,
    });
  }

  const windowed = recipients.slice(
    offset,
    limit != null ? offset + limit : undefined
  );

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      onlyNew,
      campaignId,
      totalConfirmedUsers: recipients.length,
      windowSize: windowed.length,
      offset,
      limit,
      withLabel: windowed.filter((r) => !!r.label).length,
      withoutLabel: windowed.filter((r) => !r.label).length,
      ...(newMeta
        ? {
            newCount: newMeta.newRecipients.length,
            audienceTotal: newMeta.audienceTotal,
            alreadySent: newMeta.alreadySent,
            emailOnlyExcluded: newMeta.emailOnlyExcluded,
          }
        : {}),
      ...(unsentMeta
        ? {
            unsentCount: unsentMeta.unsentRecipients.length,
            audienceTotal: unsentMeta.audienceTotal,
            alreadySent: unsentMeta.alreadySent,
            tracedSent: unsentMeta.tracedSent,
            emailOnlyExcluded: unsentMeta.emailOnlyExcluded,
            untracedPreviousSend: unsentMeta.untracedPreviousSend,
            lastSentAt: unsentMeta.lastSentAt,
          }
        : {}),
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  // Destinataires effectivement envoyés — enregistrés ensuite comme `sent` dans
  // broadcast_recipients pour amorcer / tenir à jour le diff « nouveaux inscrits ».
  const sentRecipients: ComputedRecipient[] = [];

  for (const r of windowed) {
    try {
      const unsubscribeUrl = buildRecipientUnsubscribeUrl(r);
      const result = await campaign.send(r.email, r.label, unsubscribeUrl);
      if (result.success) {
        sent++;
        sentRecipients.push(r);
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

  // Trace par-destinataire (best-effort) : sans elle, un envoi direct ne
  // laisserait aucune référence et le prochain « nouveaux inscrits » renverrait
  // à tout le monde. Un échec ici ne doit pas faire échouer l'envoi.
  if (sentRecipients.length > 0) {
    try {
      await recordSentRecipients(campaignId, sentRecipients);
    } catch (recErr) {
      logger.error('[broadcast] recordSentRecipients error:', recErr);
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
          mode: onlyUnsent
            ? 'manual-audience-diff'
            : onlyNew
              ? 'manual-new'
              : 'manual',
          only_new: onlyNew,
          only_unsent: onlyUnsent,
          // Tracé pour que le journal dise s'il s'agissait d'un vrai diff ou
          // d'un envoi complet assumé faute de trace.
          acknowledged_untraced: onlyUnsent
            ? Boolean(unsentMeta?.untracedPreviousSend && acknowledgeUntraced)
            : undefined,
          already_sent: newMeta?.alreadySent ?? unsentMeta?.alreadySent,
          email_only_excluded:
            newMeta?.emailOnlyExcluded ?? unsentMeta?.emailOnlyExcluded,
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
    onlyNew,
    onlyUnsent,
    totalConfirmedUsers: recipients.length,
    windowSize: windowed.length,
    offset,
    limit,
    sent,
    failed,
    ...(newMeta
      ? {
          newCount: newMeta.newRecipients.length,
          alreadySent: newMeta.alreadySent,
          emailOnlyExcluded: newMeta.emailOnlyExcluded,
        }
      : {}),
    errors: errors.length > 0 ? errors : undefined,
  });
}

// PATCH — édite une campagne DB (corps structuré, objet, statut…).
async function handleUpdate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  campaign: BroadcastCampaign
) {
  if (campaign.source !== 'db') {
    return res.status(403).json({
      error: 'Cette campagne est figée et ne peut pas être modifiée.',
    });
  }
  const parsed = campaignInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({
      error: first
        ? `${first.path.join('.')}: ${first.message}`
        : 'Données invalides.',
    });
  }
  const input = parsed.data;

  const { error: updErr } = await supabaseAdmin!
    .from('email_campaigns')
    .update({
      name: input.name,
      description: input.description,
      subject: input.subject,
      audience: input.audience,
      status: input.status,
      heading: input.heading,
      greeting_enabled: input.greetingEnabled,
      body_format: input.bodyFormat,
      body_paragraphs: input.bodyParagraphs,
      body_html: input.bodyFormat === 'html' ? (input.bodyHtml ?? null) : null,
      cta_label: input.ctaLabel ?? null,
      cta_url: input.ctaUrl ?? null,
      footer_note: input.footerNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  if (updErr) {
    logger.error('[broadcast/update] error:', updErr);
    return res.status(500).json({ error: 'Echec de la mise à jour.' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast',
        entity_id: campaign.id,
        payload: {
          campaign: campaign.id,
          campaign_name: input.name,
          mode: 'campaign-updated',
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/update] log error:', logErr);
    }
  }

  return res.status(200).json({ success: true, campaignId: campaign.id });
}

// DELETE — supprime une campagne DB et tout son planning de vagues associé.
async function handleDelete(
  _req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  campaign: BroadcastCampaign
) {
  if (campaign.source !== 'db') {
    return res.status(403).json({
      error: 'Cette campagne est figée et ne peut pas être supprimée.',
    });
  }

  // Nettoie le planning + le snapshot de destinataires (sinon orphelins).
  await supabaseAdmin!
    .from('broadcast_recipients')
    .delete()
    .eq('campaign_id', campaign.id);
  await supabaseAdmin!
    .from('broadcast_schedules')
    .delete()
    .eq('campaign_id', campaign.id);

  const { error: delErr } = await supabaseAdmin!
    .from('email_campaigns')
    .delete()
    .eq('id', campaign.id);

  if (delErr) {
    logger.error('[broadcast/delete] error:', delErr);
    return res.status(500).json({ error: 'Echec de la suppression.' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'broadcast',
        entity_id: campaign.id,
        payload: {
          campaign: campaign.id,
          campaign_name: campaign.name,
          mode: 'campaign-deleted',
        },
      });
    } catch (logErr) {
      logger.error('[broadcast/delete] log error:', logErr);
    }
  }

  return res.status(200).json({ success: true, campaignId: campaign.id });
}
