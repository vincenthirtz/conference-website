// features/admin/communications/service.ts — campagnes email staff :
// abonnements, catalogue + stats, création / édition / suppression /
// duplication, envoi (test, aperçu, diff, fenêtre), prévisualisation HTML,
// programmation par vagues.
//
// La logique d'audience, d'envoi et de vagues reste dans utils/broadcasts
// (partagée avec le cron broadcast-process) : ce service l'orchestre.
//
// Journal : les anciens `other` ont reçu un slug précis
// (`broadcast_campaign_*`, `broadcast_wave_send`, `broadcast_schedule_*`) ;
// `entity_type` et `payload` (dont `mode`) sont inchangés — les stats de la
// liste lisent `entity_type='broadcast'` + `payload.campaign`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
} from '@/utils/admin/errors';
import {
  buildBroadcastUnsubscribeUrl,
  buildRecipientUnsubscribeUrl,
  type BroadcastCampaign,
  type CampaignAudience,
  type ComputedRecipient,
  computeAudienceRecipients,
  computeNewRecipients,
  computeSubscriptionStats,
  computeUnsentRecipients,
  generateUniqueCampaignId,
  getCampaign,
  listCampaigns,
  type NewRecipientsResult,
  processCampaignWave,
  recordSentRecipients,
  type SubscriptionStats,
  type UnsentRecipientsResult,
} from '@/utils/broadcasts';
import type { CampaignBody } from '@/utils/email';
import {
  type CampaignInput,
  campaignInputSchema,
} from '@/utils/campaignSchema';
import { applyBrand, resolveEmailBrand } from '@/utils/emailBrand';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';

export async function getSubscriptionStats(
  ctx: ServiceContext
): Promise<SubscriptionStats> {
  try {
    return await computeSubscriptionStats();
  } catch (err: unknown) {
    ctx.logger.error('[broadcast/subscriptions] error:', err);
    throw new AdminError(
      500,
      'internal',
      'Echec du chargement des abonnements'
    );
  }
}

/* ------------------------------------------------------------------------
 * Aides
 * --------------------------------------------------------------------- */

const fail500 = (message: string) => new LegacyAdminError(500, message);

/** Paramètre `campaignId` tel que le lisaient les routes (`String(… ?? '')`). */
export function campaignIdOf(raw: unknown): string {
  return String(raw ?? '');
}

async function requireCampaign(campaignId: string): Promise<BroadcastCampaign> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new NotFoundError('Campagne inconnue.');
  return campaign;
}

/** Validation du formulaire, message d'origine `chemin: message`. */
function parseCampaignInput(raw: unknown): CampaignInput {
  const parsed = campaignInputSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  throw new LegacyAdminError(
    400,
    first ? `${first.path.join('.')}: ${first.message}` : 'Données invalides.'
  );
}

function actorUserId(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.userId : null;
}

function firstString(v: unknown): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x : undefined;
}

/** Contenu d'une campagne en colonnes `email_campaigns`. */
function campaignColumns(input: CampaignInput) {
  return {
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
  };
}

/* ------------------------------------------------------------------------
 * Liste + stats (GET /api/admin/broadcast)
 * --------------------------------------------------------------------- */

type CampaignStats = {
  totalSent: number;
  totalFailed: number;
  lastRunAt: string | null;
  runsCount: number;
};

type ScheduleStatus = 'scheduled' | 'paused' | 'completed';

type CampaignSchedule = {
  waveSize: number;
  status: ScheduleStatus;
  lastWaveAt: string | null;
  totalRecipients: number;
  pending: number;
  sent: number;
  failed: number;
} | null;

export type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  subject: string;
  status: string;
  audience: string;
  /** 'builtin' = legacy non éditable ; 'db' = créée depuis l'admin */
  source: 'builtin' | 'db';
  /** Corps structuré (prefill du formulaire) — présent pour les campagnes 'db' */
  body: CampaignBody | null;
  stats: CampaignStats;
  schedule: CampaignSchedule;
};

const emptyStats = (): CampaignStats => ({
  totalSent: 0,
  totalFailed: 0,
  lastRunAt: null,
  runsCount: 0,
});

/**
 * Page du catalogue (DB + builtin) ; stats du journal, plannings et
 * compteurs de destinataires agrégés UNIQUEMENT pour les ids de la page.
 */
export async function listCampaignSummaries(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<{ campaigns: CampaignSummary[]; total: number }> {
  const all = await listCampaigns();
  const total = all.length;
  // Même lecture que `parsePagination(req, { limit: 25 })` (max 1000).
  const limit = Math.max(
    1,
    Math.min(1000, Number.parseInt(firstString(query.limit) ?? '25', 10) || 25)
  );
  const offset = Math.max(
    0,
    Number.parseInt(firstString(query.offset) ?? '0', 10) || 0
  );
  const page = all.slice(offset, offset + limit);
  const pageIds = page.map((c) => c.id);
  if (pageIds.length === 0) return { campaigns: [], total };

  const logs = await repo.listBroadcastLogs(ctx.db, ctx.tenantId, pageIds);
  if (logs.error) {
    ctx.logger.error('[broadcast/index] staff_logs error:', logs.error);
    throw fail500('Echec du chargement des stats');
  }
  const statsByCampaign = new Map<string, CampaignStats>();
  for (const log of logs.rows ?? []) {
    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const campaignId =
      typeof payload.campaign === 'string' ? payload.campaign : null;
    if (!campaignId) continue;
    const current = statsByCampaign.get(campaignId) ?? emptyStats();
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

  const schedules = await repo.listSchedules(ctx.db, pageIds);
  if (schedules.error) {
    ctx.logger.error(
      '[broadcast/index] broadcast_schedules error:',
      schedules.error
    );
    throw fail500('Echec du chargement des plannings');
  }
  const scheduleByCampaign = new Map(
    (schedules.rows ?? []).map((row) => [
      row.campaign_id,
      {
        waveSize: row.wave_size,
        // `text` libre en base ; l'écran n'en connaît que trois valeurs.
        status: row.status as ScheduleStatus,
        lastWaveAt: row.last_wave_at ?? null,
        totalRecipients: row.total_recipients ?? 0,
      },
    ])
  );

  const recipients = await repo.listRecipientStatuses(ctx.db, pageIds);
  if (recipients.error) {
    ctx.logger.error(
      '[broadcast/index] broadcast_recipients error:',
      recipients.error
    );
    throw fail500('Echec du chargement des destinataires');
  }
  const counts = new Map<
    string,
    { pending: number; sent: number; failed: number }
  >();
  for (const row of recipients.rows ?? []) {
    const cur = counts.get(row.campaign_id) ?? {
      pending: 0,
      sent: 0,
      failed: 0,
    };
    const s = row.status;
    if (s === 'pending' || s === 'sent' || s === 'failed') cur[s] += 1;
    counts.set(row.campaign_id, cur);
  }

  const campaigns: CampaignSummary[] = page.map((c) => {
    const sched = scheduleByCampaign.get(c.id);
    const n = counts.get(c.id) ?? { pending: 0, sent: 0, failed: 0 };
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      subject: c.subject,
      status: c.status,
      audience: c.audience,
      source: c.source,
      body: c.body ?? null,
      stats: statsByCampaign.get(c.id) ?? emptyStats(),
      schedule: sched ? { ...sched, ...n } : null,
    };
  });
  return { campaigns, total };
}

/* ------------------------------------------------------------------------
 * Création / édition / suppression / duplication
 * --------------------------------------------------------------------- */

/** Id = slug stable du nom, rendu unique par suffixe (-2, -3…). */
export async function createCampaign(
  ctx: ServiceContext,
  raw: unknown
): Promise<Audited<{ campaign: { id: string } }>> {
  const input = parseCampaignInput(raw);
  let id: string;
  try {
    id = await generateUniqueCampaignId(input.name);
  } catch (err) {
    ctx.logger.error('[broadcast/create] slug check error:', err);
    throw fail500('Echec de la création.');
  }
  const { error } = await repo.insertCampaign(ctx.db, {
    id,
    ...campaignColumns(input),
    created_by: actorUserId(ctx),
  });
  if (error) {
    ctx.logger.error('[broadcast/create] insert error:', error);
    throw fail500('Echec de la création.');
  }
  return {
    result: { campaign: { id } },
    audit: {
      entity_type: 'broadcast',
      entity_id: id,
      payload: {
        campaign: id,
        campaign_name: input.name,
        mode: 'campaign-created',
      },
    },
  };
}

/** Les campagnes builtin (codées en dur) sont figées : 403. */
function requireEditable(campaign: BroadcastCampaign, verb: string) {
  if (campaign.source !== 'db') {
    throw new LegacyAdminError(
      403,
      `Cette campagne est figée et ne peut pas être ${verb}.`
    );
  }
}

export async function updateCampaign(
  ctx: ServiceContext,
  campaignId: string,
  raw: unknown
): Promise<Audited<{ success: true; campaignId: string }>> {
  const campaign = await requireCampaign(campaignId);
  requireEditable(campaign, 'modifiée');
  const input = parseCampaignInput(raw);
  const { error } = await repo.updateCampaign(ctx.db, campaign.id, {
    ...campaignColumns(input),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    ctx.logger.error('[broadcast/update] error:', error);
    throw fail500('Echec de la mise à jour.');
  }
  return {
    result: { success: true, campaignId: campaign.id },
    audit: {
      entity_type: 'broadcast',
      entity_id: campaign.id,
      payload: {
        campaign: campaign.id,
        campaign_name: input.name,
        mode: 'campaign-updated',
      },
    },
  };
}

export async function deleteCampaign(
  ctx: ServiceContext,
  campaignId: string
): Promise<Audited<{ success: true; campaignId: string }>> {
  const campaign = await requireCampaign(campaignId);
  requireEditable(campaign, 'supprimée');
  const { error } = await repo.deleteCampaignCascade(ctx.db, campaign.id);
  if (error) {
    ctx.logger.error('[broadcast/delete] error:', error);
    throw fail500('Echec de la suppression.');
  }
  return {
    result: { success: true, campaignId: campaign.id },
    audit: {
      entity_type: 'broadcast',
      entity_id: campaign.id,
      payload: {
        campaign: campaign.id,
        campaign_name: campaign.name,
        mode: 'campaign-deleted',
      },
    },
  };
}

/**
 * Copie TOUJOURS en `draft` (jamais envoyable par accident), nom
 * « … (copie) » tronqué à 120 ; une source builtin sans corps reçoit un
 * contenu minimal valide. Aucun email envoyé.
 */
export async function duplicateCampaign(
  ctx: ServiceContext,
  campaignId: string
): Promise<Audited<{ campaign: { id: string } }>> {
  const source = await requireCampaign(campaignId);
  const name = `${source.name} (copie)`.slice(0, 120);
  const body = source.body;
  const bodyParagraphs =
    body && body.bodyParagraphs.length > 0
      ? body.bodyParagraphs
      : [source.description || source.subject];

  const input = parseCampaignInput({
    name,
    subject: source.subject,
    description: source.description,
    audience: source.audience,
    status: 'draft',
    heading: body?.heading || source.name,
    greetingEnabled: body?.greetingEnabled ?? true,
    bodyParagraphs,
    ctaLabel: body?.ctaLabel ?? null,
    ctaUrl: body?.ctaUrl ?? null,
    footerNote: body?.footerNote ?? null,
  });

  let id: string;
  try {
    id = await generateUniqueCampaignId(input.name);
  } catch (err) {
    ctx.logger.error('[broadcast/duplicate] slug check error:', err);
    throw fail500('Echec de la duplication.');
  }
  // Colonnes d'origine de la duplication (ni body_format ni body_html).
  const { error } = await repo.insertCampaign(ctx.db, {
    id,
    name: input.name,
    description: input.description,
    subject: input.subject,
    audience: input.audience,
    status: input.status,
    heading: input.heading,
    greeting_enabled: input.greetingEnabled,
    body_paragraphs: input.bodyParagraphs,
    cta_label: input.ctaLabel ?? null,
    cta_url: input.ctaUrl ?? null,
    footer_note: input.footerNote ?? null,
    created_by: actorUserId(ctx),
  });
  if (error) {
    ctx.logger.error('[broadcast/duplicate] insert error:', error);
    throw fail500('Echec de la duplication.');
  }
  return {
    result: { campaign: { id } },
    audit: {
      entity_type: 'broadcast',
      entity_id: id,
      payload: {
        campaign: id,
        campaign_name: input.name,
        source_campaign: source.id,
        mode: 'campaign-duplicated',
      },
    },
  };
}

/* ------------------------------------------------------------------------
 * Envoi (POST /api/admin/broadcast/[campaignId])
 * --------------------------------------------------------------------- */

/**
 * Trois modes : `testTo` (une adresse, lien de désinscription au nom du
 * staff), `dryRun` (calcul seul), envoi réel. `onlyNew` / `onlyUnsent`
 * restreignent aux destinataires jamais adressés ; un envoi réel en
 * `onlyUnsent` sur une campagne déjà partie SANS trace exige
 * `acknowledgeUntraced` (409 `UNTRACED_PREVIOUS_SEND`). Test et aperçu ne
 * sont pas journalisés.
 */
export async function sendCampaign(
  ctx: ServiceContext,
  campaignId: string,
  body: Record<string, unknown>
): Promise<Audited<Record<string, unknown>>> {
  const campaign = await requireCampaign(campaignId);
  if (campaign.status === 'archived') {
    throw new LegacyAdminError(400, 'Campagne archivée.');
  }

  const testTo = typeof body.testTo === 'string' ? body.testTo.trim() : null;
  if (testTo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      throw new LegacyAdminError(400, 'Adresse email invalide.');
    }
    const testLabel =
      typeof body.testLabel === 'string' ? body.testLabel.trim() || null : null;
    try {
      const userId = actorUserId(ctx);
      const unsubscribeUrl = userId
        ? buildBroadcastUnsubscribeUrl(userId)
        : undefined;
      const result = await campaign.send(testTo, testLabel, unsubscribeUrl);
      return {
        result: {
          success: result.success,
          test: true,
          campaignId,
          to: testTo,
          error: result.error,
          id: result.id,
        },
        audit: { skip: true },
      };
    } catch (err: unknown) {
      throw new LegacyAdminError(500, (err as Error).message, {
        extra: { success: false },
      });
    }
  }

  const dryRun = Boolean(body.dryRun);
  const onlyNew = Boolean(body.onlyNew);
  const onlyUnsent = Boolean(body.onlyUnsent);
  const acknowledgeUntraced = Boolean(body.acknowledgeUntraced);
  const rawLimit = Number(body.limit);
  const rawOffset = Number(body.offset);
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
    ctx.logger.error('[broadcast] computeAudienceRecipients error:', err);
    throw fail500('Echec du chargement des comptes');
  }

  if (
    onlyUnsent &&
    !dryRun &&
    unsentMeta?.untracedPreviousSend &&
    !acknowledgeUntraced
  ) {
    throw new LegacyAdminError(
      409,
      'Cette campagne a déjà été envoyée sans trace par destinataire : le diff ne peut pas distinguer qui a reçu quoi. Confirme pour envoyer à toute l’audience.',
      {
        code: 'UNTRACED_PREVIOUS_SEND',
        extra: {
          audienceTotal: unsentMeta.audienceTotal,
          lastSentAt: unsentMeta.lastSentAt,
        },
      }
    );
  }

  const windowed = recipients.slice(
    offset,
    limit != null ? offset + limit : undefined
  );

  if (dryRun) {
    return {
      result: {
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
      },
      audit: { skip: true },
    };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const sentRecipients: ComputedRecipient[] = [];
  for (const r of windowed) {
    try {
      const result = await campaign.send(
        r.email,
        r.label,
        buildRecipientUnsubscribeUrl(r)
      );
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
      if (errors.length < 20)
        errors.push(`${r.email}: ${(err as Error).message}`);
    }
  }

  // Trace par destinataire (best-effort) : sans elle, le prochain « nouveaux
  // inscrits » renverrait à tout le monde.
  if (sentRecipients.length > 0) {
    try {
      await recordSentRecipients(campaignId, sentRecipients);
    } catch (err) {
      ctx.logger.error('[broadcast] recordSentRecipients error:', err);
    }
  }

  return {
    result: {
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
    },
    audit: {
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
        acknowledged_untraced: onlyUnsent
          ? Boolean(unsentMeta?.untracedPreviousSend && acknowledgeUntraced)
          : undefined,
        already_sent: newMeta?.alreadySent ?? unsentMeta?.alreadySent,
        email_only_excluded:
          newMeta?.emailOnlyExcluded ?? unsentMeta?.emailOnlyExcluded,
        errors: errors.length > 0 ? errors : undefined,
      },
    },
  };
}

/* ------------------------------------------------------------------------
 * Prévisualisation (GET …/preview) et vagues
 * --------------------------------------------------------------------- */

/**
 * HTML de la campagne, jetons de marque résolus comme le fait le transport
 * (`sendEmail`) — marque plateforme, comme `sendCampaignEmail`.
 */
export async function renderCampaignPreview(
  campaignId: string,
  rawLabel: unknown
): Promise<string> {
  const campaign = await requireCampaign(campaignId);
  const label =
    typeof rawLabel === 'string' && rawLabel.trim()
      ? rawLabel.trim().slice(0, 80)
      : null;
  const brand = await resolveEmailBrand();
  return applyBrand(campaign.buildHtml(label), brand);
}

/** Déclenche la prochaine vague d'une campagne planifiée, sans attendre le cron. */
export async function sendNextWave(
  ctx: ServiceContext,
  campaignId: string
): Promise<Audited<Record<string, unknown>>> {
  const campaign = await requireCampaign(campaignId);
  let result: Awaited<ReturnType<typeof processCampaignWave>>;
  try {
    result = await processCampaignWave(campaignId);
  } catch (err: unknown) {
    ctx.logger.error('[broadcast/wave] error:', err);
    throw new LegacyAdminError(500, (err as Error).message);
  }
  if (!result) {
    throw new LegacyAdminError(
      400,
      'Aucun planning actif pour cette campagne.'
    );
  }
  return {
    result: { success: true, ...result },
    audit: {
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
    },
  };
}

/** État du planning + répartition des destinataires par statut. */
export async function getCampaignSchedule(
  ctx: ServiceContext,
  campaignId: string
) {
  await requireCampaign(campaignId);
  const { row: schedule, error } = await repo.getSchedule(ctx.db, campaignId);
  if (error) {
    ctx.logger.error('[broadcast/schedule GET] schedule error:', error);
    throw fail500('Echec du chargement du planning');
  }
  const counts = await repo.listCampaignRecipientStatuses(ctx.db, campaignId);
  if (counts.error) {
    ctx.logger.error('[broadcast/schedule GET] counts error:', counts.error);
    throw fail500('Echec du chargement des stats');
  }
  const recipients = { pending: 0, sent: 0, failed: 0 };
  for (const row of counts.rows ?? []) {
    const s = row.status;
    if (s === 'pending' || s === 'sent' || s === 'failed') recipients[s]++;
  }
  return { schedule: schedule ?? null, recipients };
}

const SNAPSHOT_CHUNK = 500;

/**
 * Crée ou met à jour le planning (`status='scheduled'`) et snapshote les
 * destinataires éligibles en `pending`. Les destinataires sans compte
 * (email-only) sont écartés — `user_id` NOT NULL — et comptés, jamais
 * perdus en silence.
 */
export async function scheduleCampaign(
  ctx: ServiceContext,
  campaignId: string,
  body: Record<string, unknown>
): Promise<Audited<Record<string, unknown>>> {
  const campaign = await requireCampaign(campaignId);
  const audience: CampaignAudience = campaign.audience;

  const rawWaveSize = Number(body.waveSize);
  if (!Number.isFinite(rawWaveSize) || rawWaveSize < 1 || rawWaveSize > 290) {
    throw new LegacyAdminError(
      400,
      'waveSize doit être un entier entre 1 et 290.'
    );
  }
  const waveSize = Math.floor(rawWaveSize);

  let recipients: ComputedRecipient[];
  try {
    recipients = await computeAudienceRecipients(audience);
  } catch (err: unknown) {
    ctx.logger.error('[broadcast/schedule] recipients error:', err);
    throw fail500('Echec du calcul des destinataires');
  }
  if (recipients.length === 0) {
    throw new LegacyAdminError(
      400,
      'Aucun destinataire éligible pour cette campagne.'
    );
  }

  const schedulable = recipients.filter(
    (r): r is typeof r & { user_id: string } => Boolean(r.user_id)
  );
  const emailOnlySkipped = recipients.length - schedulable.length;
  if (schedulable.length === 0) {
    throw new LegacyAdminError(
      400,
      'Cette audience ne contient que des destinataires sans compte (email-only). ' +
        'Utilisez « Envoyer maintenant » pour les adresser : l’envoi planifié par vagues nécessite un compte utilisateur.'
    );
  }

  const rows = schedulable.map((r) => ({
    campaign_id: campaignId,
    user_id: r.user_id,
    email: r.email,
    label: r.label,
    status: 'pending' as const,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += SNAPSHOT_CHUNK) {
    const { error, count } = await repo.snapshotRecipients(
      ctx.db,
      rows.slice(i, i + SNAPSHOT_CHUNK)
    );
    if (error) {
      ctx.logger.error('[broadcast/schedule] insert error:', error);
      throw fail500('Echec du snapshot recipients');
    }
    inserted += count ?? 0;
  }

  const existing = await repo.hasSchedule(ctx.db, campaignId);
  const { error: upErr } = await repo.upsertSchedule(ctx.db, {
    campaign_id: campaignId,
    wave_size: waveSize,
    status: 'scheduled',
    total_recipients: schedulable.length,
    ...(existing ? {} : { created_by: actorUserId(ctx) }),
    updated_at: new Date().toISOString(),
  });
  if (upErr) {
    ctx.logger.error('[broadcast/schedule] upsert error:', upErr);
    throw fail500('Echec de la planification');
  }

  return {
    result: {
      success: true,
      campaignId,
      waveSize,
      totalRecipients: schedulable.length,
      emailOnlySkipped,
      newlyInserted: inserted,
    },
    audit: {
      entity_type: 'broadcast_schedule',
      payload: {
        campaign: campaignId,
        campaign_name: campaign.name,
        wave_size: waveSize,
        total_recipients: schedulable.length,
        email_only_skipped: emailOnlySkipped,
        newly_inserted: inserted,
        mode: existing ? 'updated' : 'created',
      },
    },
  };
}

/** Annule le planning ; les destinataires déjà traités restent en historique. */
export async function cancelCampaignSchedule(
  ctx: ServiceContext,
  campaignId: string
): Promise<Audited<Record<string, unknown>>> {
  const campaign = await requireCampaign(campaignId);
  const del = await repo.deletePendingRecipients(ctx.db, campaignId);
  if (del.error) {
    ctx.logger.error(
      '[broadcast/schedule DELETE] recipients error:',
      del.error
    );
    throw fail500('Echec de la suppression');
  }
  const { error } = await repo.deleteSchedule(ctx.db, campaignId);
  if (error) {
    ctx.logger.error('[broadcast/schedule DELETE] schedule error:', error);
    throw fail500('Echec de la suppression');
  }
  return {
    result: { success: true, campaignId, deletedPending: del.count ?? 0 },
    audit: {
      entity_type: 'broadcast_schedule',
      payload: {
        campaign: campaignId,
        campaign_name: campaign.name,
        mode: 'cancelled',
        deleted_pending: del.count ?? 0,
      },
    },
  };
}
