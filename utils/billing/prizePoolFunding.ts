// utils/billing/prizePoolFunding.ts
//
// « Profondeur de la monétisation » — cash-prize crowdfundé.
//
// Un supporter « fait un don » ciblé sur un tournoi ; le webhook HelloAsso
// confirme le paiement et incrémente la cagnotte (prize pool) du tournoi.
// Analogue DIRECT du billing tenant-plan (utils/billing/tenantPlanBilling.ts) :
// même patron corrélation checkout ↔ cible + ledger d'idempotence.
//
// ── Mécanisme de corrélation don ↔ cagnotte ─────────────────────────────────
// PRIMAIRE : la **metadata** du checkout-intent HelloAsso. À la génération du
// lien (pages/api/helloasso/prize-checkout.ts) on attache
// `metadata: { kind:'prize_pool', prize_pool_id, tenant_id }`. HelloAsso stocke
// cette metadata et la RENVOIE dans la notification de paiement (`data.metadata`
// ou racine `metadata`). On lit les deux emplacements par prudence.
//
// FALLBACK : la table `prize_pool_checkouts` (checkout_intent_id → cagnotte +
// inputs contributeur) écrite à la génération du lien. Sert aussi à récupérer le
// nom / message / anonymat que le payload de paiement HelloAsso ne porte pas.
//
// ── Idempotence ─────────────────────────────────────────────────────────────
// Chaque `helloasso_payment_id` (TEXT UNIQUE dans prize_pool_contributions)
// n'est appliqué qu'une fois. Un rejeu du webhook ne recrédite jamais la
// cagnotte. La contribution EST le ledger : on l'insère AVANT d'incrémenter le
// total dénormalisé, de sorte qu'une course concurrente (deux webhooks
// simultanés) échoue à l'insert unique et n'incrémente pas.
//
// Voir database/migrations/create_prize_pool_tables.sql.

import { z } from 'zod';
import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import type { HelloAssoWebhookEvent } from '../helloasso';

/** Metadata qu'on attache au checkout-intent et qu'on relit dans le webhook. */
export const PRIZE_METADATA_KIND = 'prize_pool' as const;

/**
 * Schéma strict de la metadata de corrélation. Un `parse` (pas un `if`) garantit
 * l'extraction typée — utile pour la sûreté et pour le taint-tracking CodeQL :
 * on ne fait jamais confiance au JSON brut du webhook.
 */
const prizeMetadataSchema = z.object({
  kind: z.literal(PRIZE_METADATA_KIND),
  prize_pool_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

/** Construit l'objet metadata à attacher au checkout-intent (source unique). */
export function buildPrizeCheckoutMetadata(
  prizePoolId: string,
  tenantId: string
): Record<string, unknown> {
  return {
    kind: PRIZE_METADATA_KIND,
    prize_pool_id: prizePoolId,
    tenant_id: tenantId,
  };
}

export type PrizeCorrelation = {
  prizePoolId: string;
  tenantId: string;
  /** Id du checkout-intent HelloAsso, en TEXT (colonne DB). */
  checkoutIntentId: string | null;
  /** Snapshot pour affichage — nom réel (l'anonymisation est décidée à la lecture publique). */
  contributorName: string | null;
  isAnonymous: boolean;
  message: string | null;
  /** D'où vient la corrélation (observabilité / debug). */
  source: 'metadata' | 'checkout_mapping';
};

/** Lit un objet metadata candidat, quel que soit son emplacement. */
function readRawMetadata(event: HelloAssoWebhookEvent): unknown {
  return event.data?.metadata ?? event.metadata ?? null;
}

/** Extrait un checkout_intent_id (numérique HelloAsso) d'un endroit plausible. */
function readCheckoutIntentNumber(event: HelloAssoWebhookEvent): number | null {
  const d = event.data as Record<string, unknown> | undefined;
  const md = readRawMetadata(event) as Record<string, unknown> | null;
  const order = d?.order as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    d?.checkoutIntentId,
    md?.checkout_intent_id,
    order?.checkoutIntentId,
  ];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Nom du payer HelloAsso (fallback si aucun input contributeur capturé). */
function readPayerName(event: HelloAssoWebhookEvent): string | null {
  const name = [event.data?.payer?.firstName, event.data?.payer?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}

type CheckoutRow = {
  prize_pool_id: string;
  tenant_id: string;
  checkout_intent_id: string;
  contributor_name: string | null;
  is_anonymous: boolean | null;
  message: string | null;
};

/**
 * Résout la cagnotte + les inputs contributeur associés à un event HelloAsso,
 * ou `null` si l'event n'est pas un don ciblé prize-pool (don générique ou
 * plan → inchangé). Metadata d'abord, mapping `prize_pool_checkouts` en secours.
 *
 * Le mapping sert aussi à récupérer le nom / message / anonymat capturés au
 * checkout, que le payload de paiement HelloAsso ne porte pas.
 */
export async function resolvePrizeCorrelation(
  event: HelloAssoWebhookEvent
): Promise<PrizeCorrelation | null> {
  const checkoutNum = readCheckoutIntentNumber(event);
  const payerName = readPayerName(event);

  // Charge la row checkout (par checkout_intent_id TEXT) si on connaît l'id.
  let checkoutRow: CheckoutRow | null = null;
  if (checkoutNum != null) {
    const { data } = await supabaseAdmin
      .from('prize_pool_checkouts')
      .select(
        'prize_pool_id, tenant_id, checkout_intent_id, contributor_name, is_anonymous, message'
      )
      .eq('checkout_intent_id', String(checkoutNum))
      .maybeSingle();
    checkoutRow = (data as CheckoutRow | null) ?? null;
  }

  // 1) PRIMAIRE : metadata du checkout-intent.
  const parsed = prizeMetadataSchema.safeParse(readRawMetadata(event));
  if (parsed.success) {
    return {
      prizePoolId: parsed.data.prize_pool_id,
      tenantId: parsed.data.tenant_id,
      checkoutIntentId:
        checkoutNum != null
          ? String(checkoutNum)
          : (checkoutRow?.checkout_intent_id ?? null),
      contributorName: checkoutRow?.contributor_name ?? payerName,
      isAnonymous: checkoutRow?.is_anonymous ?? false,
      message: checkoutRow?.message ?? null,
      source: 'metadata',
    };
  }

  // 2) FALLBACK : mapping stocké à la génération du lien.
  if (checkoutRow) {
    return {
      prizePoolId: checkoutRow.prize_pool_id,
      tenantId: checkoutRow.tenant_id,
      checkoutIntentId: checkoutRow.checkout_intent_id,
      contributorName: checkoutRow.contributor_name ?? payerName,
      isAnonymous: checkoutRow.is_anonymous ?? false,
      message: checkoutRow.message ?? null,
      source: 'checkout_mapping',
    };
  }

  return null;
}

export type ApplyPrizeResult =
  | {
      status: 'applied';
      prizePoolId: string;
      amountCents: number;
      raisedAmountCents: number;
    }
  | { status: 'already_applied'; prizePoolId: string }
  | { status: 'invalid_amount'; prizePoolId: string }
  | { status: 'unknown_pool'; prizePoolId: string }
  | { status: 'error'; prizePoolId: string };

type PrizePoolRow = {
  id: string;
  tenant_id: string;
  raised_amount_cents: number | null;
};

/**
 * Applique une contribution confirmée, de façon IDEMPOTENTE sur
 * `helloasso_payment_id`.
 *
 * Ordre (idempotence + course concurrente) :
 *   1. Sanity montant (entier > 0 — pas de barème plancher pour un don).
 *   2. Court-circuit si une contribution existe déjà pour ce paiement.
 *   3. INSERT de la contribution (helloasso_payment_id UNIQUE = backstop) —
 *      AVANT l'incrément, pour qu'une course concurrente échoue à l'insert et
 *      n'incrémente pas le total.
 *   4. INCRÉMENT `raised_amount_cents` (read-modify-write via service role,
 *      comme tenantPlanBilling ; la contribution reste la source de vérité) +
 *      `updated_at`.
 *   5. Marque le checkout `confirmed`.
 *
 * `amountCents` = montant RÉELLEMENT payé (event.data.amount du webhook), pas
 * le montant demandé au checkout. `tenant_id` de la contribution vient de la
 * cagnotte (source de vérité) — defense-in-depth vs une metadata forgée.
 */
export async function applyPrizeContribution(
  resolved: PrizeCorrelation,
  helloAssoPaymentId: string,
  amountCents: number,
  opts: { nowMs?: number } = {}
): Promise<ApplyPrizeResult> {
  const { prizePoolId } = resolved;

  // ── Sanity montant ────────────────────────────────────────────────────────
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    logger.warn(
      `[prizePoolFunding] invalid amount ${amountCents} for payment ${helloAssoPaymentId} — skipping`
    );
    return { status: 'invalid_amount', prizePoolId };
  }

  // ── Idempotence : ce paiement a-t-il déjà été appliqué ? ──────────────────
  const { data: existing } = await supabaseAdmin
    .from('prize_pool_contributions')
    .select('id')
    .eq('helloasso_payment_id', helloAssoPaymentId)
    .maybeSingle();
  if (existing) {
    return { status: 'already_applied', prizePoolId };
  }

  // ── La cagnotte doit exister (FK + tenant source de vérité) ────────────────
  const { data: poolData, error: poolErr } = await supabaseAdmin
    .from('tournament_prize_pools')
    .select('id, tenant_id, raised_amount_cents')
    .eq('id', prizePoolId)
    .maybeSingle();
  if (poolErr) {
    logger.error('[prizePoolFunding] pool lookup error', poolErr);
    return { status: 'error', prizePoolId };
  }
  if (!poolData) {
    logger.warn(
      `[prizePoolFunding] unknown prize pool ${prizePoolId} for payment ${helloAssoPaymentId}`
    );
    return { status: 'unknown_pool', prizePoolId };
  }
  const pool = poolData as PrizePoolRow;

  // ── INSERT contribution (ledger unique) AVANT l'incrément ─────────────────
  const { error: insErr } = await supabaseAdmin
    .from('prize_pool_contributions')
    .insert({
      prize_pool_id: prizePoolId,
      tenant_id: pool.tenant_id,
      helloasso_payment_id: helloAssoPaymentId,
      checkout_intent_id: resolved.checkoutIntentId,
      amount_cents: amountCents,
      contributor_name: resolved.contributorName,
      is_anonymous: resolved.isAnonymous,
      message: resolved.message,
    });
  if (insErr) {
    // Course concurrente : un autre webhook a inséré ce paiement entre notre
    // SELECT et notre INSERT (violation UNIQUE 23505). On considère « déjà
    // appliqué » et on n'incrémente PAS → pas de double crédit.
    logger.warn(
      '[prizePoolFunding] contribution insert failed (already applied / concurrent)',
      insErr
    );
    return { status: 'already_applied', prizePoolId };
  }

  // ── Incrément du total dénormalisé + updated_at ───────────────────────────
  const current =
    typeof pool.raised_amount_cents === 'number' ? pool.raised_amount_cents : 0;
  const raisedAmountCents = current + amountCents;
  const nowIso = new Date(opts.nowMs ?? Date.now()).toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tournament_prize_pools')
    .update({ raised_amount_cents: raisedAmountCents, updated_at: nowIso })
    .eq('id', prizePoolId);
  if (updErr) {
    logger.error('[prizePoolFunding] pool increment error', updErr);
    return { status: 'error', prizePoolId };
  }

  // ── Promotion du checkout en « confirmed » (non bloquant) ─────────────────
  if (resolved.checkoutIntentId) {
    const { error: ckErr } = await supabaseAdmin
      .from('prize_pool_checkouts')
      .update({ status: 'confirmed' })
      .eq('checkout_intent_id', resolved.checkoutIntentId);
    if (ckErr) {
      logger.warn(
        '[prizePoolFunding] checkout status update failed (non-blocking)',
        ckErr
      );
    }
  }

  return { status: 'applied', prizePoolId, amountCents, raisedAmountCents };
}
