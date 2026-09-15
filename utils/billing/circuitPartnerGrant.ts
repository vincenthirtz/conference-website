// utils/billing/circuitPartnerGrant.ts
//
// Accorder l'offre partenaire des circuits féminins et mixtes : poser le plan
// de `config/circuitPartnerOffer.ts` sur l'espace d'un circuit retenu, et le
// tracer sur sa candidature.
//
// NE RÉTROGRADE JAMAIS. Un espace déjà en `foundation` ou `editor` couvre plus
// que l'offre ; un espace déjà sur le plan offert au-delà de la nouvelle
// échéance perdrait des mois. Dans les deux cas : refus explicite
// (`plan_already_covers`), rien n'est écrit.
//
// L'ORDRE D'ÉCRITURE : CANDIDATURE D'ABORD, conditionnée à son statut
// (`new` ou `reviewing`). Deux accords simultanés ne peuvent pas réussir tous
// les deux : le second ne touche aucune ligne et rend `already_decided`. Si la
// mise à jour de l'espace échoue ensuite, la candidature est remise dans son
// statut d'origine — un accord tracé sans plan posé serait un mensonge dans
// l'historique.
//
// COMME UN PAIEMENT, SANS LEDGER. On pose les mêmes colonnes que
// `applyTenantPlanPayment` (statut actif, échéance, périodicité, relance
// réarmée, fin d'essai). À l'échéance, l'entitlement habituel s'applique.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  CIRCUIT_PARTNER_OFFER,
  circuitOfferExpiry,
} from '@/config/circuitPartnerOffer';
import type { TenantPlan } from '@/utils/billing/planFeatures';

export type CircuitGrantResult =
  | {
      ok: true;
      tenantId: string;
      tenantSlug: string;
      plan: TenantPlan;
      grantedUntil: string;
    }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'tenant_not_found'
        | 'already_decided'
        | 'plan_already_covers'
        | 'failed';
      message?: string;
    };

type TenantRow = {
  id: string;
  slug: string;
  is_active: boolean | null;
  plan: string;
  plan_status: string;
  plan_expires_at: string | null;
};

/** Plans qui couvrent déjà tout ce que l'offre donne. */
const COVERING_PLANS = new Set(['foundation', 'editor']);

export function offerWouldDowngrade(
  tenant: Pick<TenantRow, 'plan' | 'plan_status' | 'plan_expires_at'>,
  newExpiryIso: string
): boolean {
  if (COVERING_PLANS.has(tenant.plan)) return true;
  if (tenant.plan !== CIRCUIT_PARTNER_OFFER.plan) return false;
  if (tenant.plan_status !== 'active' || !tenant.plan_expires_at) return false;
  const current = Date.parse(tenant.plan_expires_at);
  return Number.isFinite(current) && current >= Date.parse(newExpiryIso);
}

export async function grantCircuitPartnerOffer(input: {
  applicationId: string;
  tenantSlug: string;
  staffId: string;
  notes?: string | null;
  nowMs?: number;
}): Promise<CircuitGrantResult> {
  if (!supabaseAdmin) return { ok: false, reason: 'failed' };
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const grantedUntil = circuitOfferExpiry(nowMs);

  const { data: application, error: appError } = await supabaseAdmin
    .from('circuit_partner_applications')
    .select('id, status')
    .eq('id', input.applicationId)
    .maybeSingle();
  if (appError)
    return { ok: false, reason: 'failed', message: appError.message };
  if (!application) return { ok: false, reason: 'not_found' };
  const previousStatus = (application as { status: string }).status;
  if (previousStatus !== 'new' && previousStatus !== 'reviewing') {
    return { ok: false, reason: 'already_decided' };
  }

  const { data: tenantData, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, is_active, plan, plan_status, plan_expires_at')
    .eq('slug', input.tenantSlug)
    .maybeSingle();
  if (tenantError) {
    return { ok: false, reason: 'failed', message: tenantError.message };
  }
  const tenant = tenantData as TenantRow | null;
  if (!tenant || tenant.is_active === false) {
    return { ok: false, reason: 'tenant_not_found' };
  }
  if (offerWouldDowngrade(tenant, grantedUntil)) {
    return { ok: false, reason: 'plan_already_covers' };
  }

  // 1) Réserver la décision : seul un appel l'emporte.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('circuit_partner_applications')
    .update({
      status: 'approved',
      granted_tenant_id: tenant.id,
      granted_plan: CIRCUIT_PARTNER_OFFER.plan,
      granted_until: grantedUntil,
      decided_by: input.staffId,
      decided_at: nowIso,
      updated_at: nowIso,
      ...(input.notes ? { admin_notes: input.notes } : {}),
    })
    .eq('id', input.applicationId)
    .in('status', ['new', 'reviewing'])
    .select('id');
  if (claimError) {
    return { ok: false, reason: 'failed', message: claimError.message };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, reason: 'already_decided' };
  }

  // 2) Poser le plan.
  const { error: planError } = await supabaseAdmin
    .from('tenants')
    .update({
      plan: CIRCUIT_PARTNER_OFFER.plan,
      plan_status: 'active',
      plan_started_at: nowIso,
      plan_expires_at: grantedUntil,
      plan_term: 'year',
      plan_last_reminder_at: null,
      plan_is_trial: false,
    })
    .eq('id', tenant.id);
  if (planError) {
    logger.error(
      '[circuit-partner] plan non posé sur %s: %s',
      tenant.slug,
      planError.message
    );
    // Défaire la décision : pas d'accord tracé sans plan posé.
    const { error: revertError } = await supabaseAdmin
      .from('circuit_partner_applications')
      .update({
        status: previousStatus,
        granted_tenant_id: null,
        granted_plan: null,
        granted_until: null,
        decided_by: null,
        decided_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.applicationId);
    if (revertError) {
      logger.error(
        '[circuit-partner] candidature %s restée « approved » sans plan: %s',
        input.applicationId,
        revertError.message
      );
    }
    return { ok: false, reason: 'failed', message: planError.message };
  }

  return {
    ok: true,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    plan: CIRCUIT_PARTNER_OFFER.plan,
    grantedUntil,
  };
}
