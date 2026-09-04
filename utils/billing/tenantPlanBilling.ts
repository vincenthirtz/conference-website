// utils/billing/tenantPlanBilling.ts
//
// « Régie solidaire » — Phase 1 : un don HelloAsso ciblé (tenant + plan)
// active / renouvelle automatiquement le plan d'un tenant.
//
// ── Mécanisme de corrélation don ↔ tenant/plan ──────────────────────────────
// PRIMAIRE : la **metadata** du checkout-intent HelloAsso. À la génération du
// lien (owner), on attache `metadata: { kind:'tenant_plan', tenant_id, plan }`
// à l'intent. HelloAsso stocke cette metadata et la RENVOIE dans la
// notification de paiement (webhook) sous `data.metadata` (ou, selon la config,
// à la racine `metadata`). On lit les deux emplacements par prudence. C'est le
// canal documenté et fiable : cf. https://dev.helloasso.com/docs/checkout.
//
// FALLBACK : une table de mapping `tenant_plan_checkouts` (checkout_intent_id →
// tenant/plan) écrite à la génération du lien. Si jamais la notification ne
// porte pas la metadata mais référence l'id du checkout-intent, on résout via
// cette table. Sert aussi d'audit opérationnel (quels liens ont été générés).
//
// ── Idempotence ─────────────────────────────────────────────────────────────
// Chaque `helloasso_payment_id` n'est appliqué qu'une fois (ledger
// `tenant_plan_payments`, colonne `helloasso_payment_id` UNIQUE). Un rejeu du
// webhook par HelloAsso ne ré-étend donc jamais l'abonnement.
//
// Voir database/migrations/add_tenant_plan_billing_tables.sql.

import { z } from 'zod';
import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { planPrice, type PlanTerm, type PurchasablePlan } from './planFeatures';
import type { HelloAssoWebhookEvent } from '../helloasso';

/** Metadata qu'on attache au checkout-intent et qu'on relit dans le webhook. */
export const PLAN_METADATA_KIND = 'tenant_plan' as const;

/**
 * Schéma strict de la metadata de corrélation. Un `parse` (pas un `if`) garantit
 * l'extraction typée — utile pour la sûreté et pour le taint-tracking CodeQL :
 * on ne fait jamais confiance au JSON brut du webhook.
 */
const planMetadataSchema = z.object({
  kind: z.literal(PLAN_METADATA_KIND),
  tenant_id: z.string().uuid(),
  plan: z.enum(['discovery', 'regie', 'circuit']),
  // Absent des liens émis avant l'ouverture du paiement mensuel : ils
  // valaient tous une année, et c'est ce que dit le défaut.
  term: z.enum(['month', 'year']).optional(),
});

export type PlanCorrelation = {
  tenantId: string;
  plan: PurchasablePlan;
  /** Périodicité payée. `year` par défaut — cf. le schéma de metadata. */
  term: PlanTerm;
  /** D'où vient la corrélation (observabilité / debug). */
  source: 'metadata' | 'checkout_mapping';
  /** Id du checkout-intent si connu (metadata fallback / mapping). */
  checkoutIntentId: number | null;
};

/** Construit l'objet metadata à attacher au checkout-intent (source unique). */
export function buildPlanCheckoutMetadata(
  tenantId: string,
  plan: PurchasablePlan,
  term: PlanTerm = 'year'
): Record<string, unknown> {
  return { kind: PLAN_METADATA_KIND, tenant_id: tenantId, plan, term };
}

/** Lit un objet metadata candidat, quel que soit son emplacement. */
function readRawMetadata(event: HelloAssoWebhookEvent): unknown {
  return event.data?.metadata ?? event.metadata ?? null;
}

/** Extrait un checkout_intent_id d'un endroit plausible de la notification. */
function readCheckoutIntentId(event: HelloAssoWebhookEvent): number | null {
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

/**
 * Résout le tenant + plan associés à un event HelloAsso, ou `null` si l'event
 * n'est pas un don ciblé plan (don générique → inchangé). Metadata d'abord,
 * mapping `tenant_plan_checkouts` en secours.
 */
export async function resolvePlanCorrelation(
  event: HelloAssoWebhookEvent
): Promise<PlanCorrelation | null> {
  // 1) PRIMAIRE : metadata du checkout-intent.
  const parsed = planMetadataSchema.safeParse(readRawMetadata(event));
  if (parsed.success) {
    return {
      tenantId: parsed.data.tenant_id,
      plan: parsed.data.plan,
      // Un lien émis avant l'ouverture du mensuel ne porte pas de périodicité :
      // il valait une année, et c'est ce qu'il doit continuer de valoir.
      term: parsed.data.term ?? 'year',
      source: 'metadata',
      checkoutIntentId: readCheckoutIntentId(event),
    };
  }

  // 2) FALLBACK : mapping stocké à la génération du lien.
  const checkoutIntentId = readCheckoutIntentId(event);
  if (checkoutIntentId == null) return null;

  const { data, error } = await supabaseAdmin
    .from('tenant_plan_checkouts')
    .select('tenant_id, plan, term')
    .eq('checkout_intent_id', checkoutIntentId)
    .maybeSingle();
  if (error || !data) return null;

  const plan = data.plan as string;
  if (plan !== 'discovery' && plan !== 'regie' && plan !== 'circuit') {
    return null;
  }
  const tenantId = data.tenant_id as string;
  if (typeof tenantId !== 'string' || tenantId.length === 0) return null;
  // Colonne posée avec un défaut `year` : une ligne antérieure au mensuel dit
  // donc « année », ce qui est exact.
  const term: PlanTerm = data.term === 'month' ? 'month' : 'year';

  return {
    tenantId,
    plan,
    term,
    source: 'checkout_mapping',
    checkoutIntentId,
  };
}

/** Ajoute un an à un instant (UTC), tolérant aux années bissextiles. */
export function addOneYearIso(fromMs: number): string {
  const d = new Date(fromMs);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

/**
 * Prolonge d'une période payée.
 *
 * `setUTCMonth` gère seul les fins de mois : un paiement du 31 janvier reporte
 * au 3 mars, pas au 31 février. C'est le comportement de tous les abonnements,
 * et le corriger « à la main » produirait des dates fausses une fois par an.
 */
export function addTermIso(fromMs: number, term: PlanTerm): string {
  if (term === 'year') return addOneYearIso(fromMs);
  const d = new Date(fromMs);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export type ApplyResult =
  | {
      status: 'applied';
      tenantId: string;
      plan: PurchasablePlan;
      planExpiresAt: string;
    }
  | { status: 'already_applied'; tenantId: string; plan: PurchasablePlan }
  | { status: 'insufficient_amount'; tenantId: string; plan: PurchasablePlan }
  | { status: 'unknown_tenant'; tenantId: string; plan: PurchasablePlan }
  | { status: 'error'; tenantId: string; plan: PurchasablePlan };

type TenantPlanRow = {
  plan: string;
  plan_status: string;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  plan_is_trial?: boolean | null;
};

/**
 * Applique un paiement plan : activation / renouvellement / extension du tenant,
 * de façon IDEMPOTENTE.
 *
 * - `amount` est en CENTIMES (comme HelloAsso). On exige `amount >= prix * 100`,
 *   sinon on n'active pas (`insufficient_amount`) — on ne fige rien dans le
 *   ledger pour qu'un paiement complémentaire puisse toujours activer.
 * - Extension : si le tenant est déjà `active` et non expiré, la nouvelle date
 *   d'expiration = `max(now, expiry actuel) + la période payée` (payer avant
 *   expiration prolonge). Sinon base = `now` (réactivation).
 * - La période vient du paiement, pas d'une constante : un mois payé prolonge
 *   d'un mois. Elle valait un an en dur, ce qui aurait offert onze mois à
 *   chaque paiement mensuel.
 * - `plan_started_at` = COALESCE(existant, now).
 */
export async function applyTenantPlanPayment(opts: {
  helloassoPaymentId: number;
  tenantId: string;
  plan: PurchasablePlan;
  /** Montant payé, EN CENTIMES. */
  amountCents: number;
  checkoutIntentId: number | null;
  /** Période payée. Absente = année : c'est ce que valaient tous les liens
   *  émis avant l'ouverture du paiement mensuel. */
  term?: PlanTerm;
  nowMs?: number;
}): Promise<ApplyResult> {
  const { helloassoPaymentId, tenantId, plan, amountCents, checkoutIntentId } =
    opts;
  const term: PlanTerm = opts.term ?? 'year';
  const nowMs = opts.nowMs ?? Date.now();

  // ── Idempotence : ce paiement a-t-il déjà été appliqué ? ──────────────────
  const { data: existing } = await supabaseAdmin
    .from('tenant_plan_payments')
    .select('helloasso_payment_id')
    .eq('helloasso_payment_id', helloassoPaymentId)
    .maybeSingle();
  if (existing) {
    return { status: 'already_applied', tenantId, plan };
  }

  // ── Contrôle du montant (barème = source unique) ──────────────────────────
  const priceEur = planPrice(plan, term);
  if (typeof priceEur === 'number' && priceEur > 0) {
    const requiredCents = priceEur * 100;
    if (amountCents < requiredCents) {
      logger.warn(
        `[tenantPlanBilling] insufficient amount for plan=${plan} tenant=${tenantId}: got ${amountCents}c, need ${requiredCents}c — not activating`
      );
      return { status: 'insufficient_amount', tenantId, plan };
    }
  }

  // ── État courant du tenant (pour extension vs réactivation) ───────────────
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select(
      'plan, plan_status, plan_started_at, plan_expires_at, plan_is_trial'
    )
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr) {
    logger.error('[tenantPlanBilling] tenant lookup error', tenantErr);
    return { status: 'error', tenantId, plan };
  }
  if (!tenant) {
    logger.warn(
      `[tenantPlanBilling] unknown tenant ${tenantId} for plan payment ${helloassoPaymentId}`
    );
    return { status: 'unknown_tenant', tenantId, plan };
  }
  const t = tenant as TenantPlanRow;

  // Base = expiry actuel si tenant déjà actif non expiré (extension), sinon now.
  //
  // Exception : un ESSAI gratuit ne s'étend pas. Sinon le premier paiement
  // offrirait l'année pleine EN PLUS des jours d'essai restants — l'essai est
  // une découverte, pas un acompte.
  const wasTrial = t.plan_is_trial === true;
  let baseMs = nowMs;
  if (!wasTrial && t.plan_status === 'active' && t.plan_expires_at) {
    const expMs = Date.parse(t.plan_expires_at);
    if (Number.isFinite(expMs) && expMs > nowMs) baseMs = expMs;
  }
  const nowIso = new Date(nowMs).toISOString();
  const planExpiresAt = addTermIso(baseMs, term);
  const planStartedAt = t.plan_started_at ?? nowIso;

  // Paiement frais (non-rejeu : l'idempotence a déjà court-circuité les rejeux
  // plus haut) → on (ré)active le plan ET on remet `plan_last_reminder_at` à
  // NULL pour ré-armer la relance de renouvellement sur le nouveau cycle
  // (cf. cron plan-renewal). On ne double-clear jamais sur un rejeu : ce chemin
  // n'est atteint que pour un paiement non encore appliqué.
  const { error: updErr } = await supabaseAdmin
    .from('tenants')
    .update({
      plan,
      plan_status: 'active',
      plan_started_at: planStartedAt,
      plan_expires_at: planExpiresAt,
      plan_last_reminder_at: null,
      // Le tenant paie : ce n'est plus un essai.
      plan_is_trial: false,
    })
    .eq('id', tenantId);
  if (updErr) {
    logger.error('[tenantPlanBilling] tenant update error', updErr);
    return { status: 'error', tenantId, plan };
  }

  // ── Ledger : marque le paiement comme appliqué (idempotence durable) ──────
  // La colonne helloasso_payment_id est UNIQUE en DB : backstop contre une
  // course concurrente (deux webhooks simultanés) que le SELECT ci-dessus ne
  // couvre pas. Un échec d'insert (23505) signifie « déjà appliqué » → on
  // reste cohérent.
  const { error: ledgerErr } = await supabaseAdmin
    .from('tenant_plan_payments')
    .insert({
      helloasso_payment_id: helloassoPaymentId,
      tenant_id: tenantId,
      plan,
      amount: amountCents,
      checkout_intent_id: checkoutIntentId,
      applied_at: nowIso,
    });
  if (ledgerErr) {
    // On a déjà appliqué le plan (idempotent côté tenant : ré-appliquer les
    // mêmes valeurs est sans effet), mais on log car le ledger a divergé.
    logger.warn(
      '[tenantPlanBilling] ledger insert failed (plan already applied to tenant)',
      ledgerErr
    );
  }

  return { status: 'applied', tenantId, plan, planExpiresAt };
}
