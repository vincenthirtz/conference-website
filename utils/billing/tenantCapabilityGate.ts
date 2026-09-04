// utils/billing/tenantCapabilityGate.ts
//
// Un point de passage pour « ce tenant a-t-il droit à cette capacité ? » côté
// routes admin.
//
// Le contrôle existait déjà, écrit à la main dans PATCH /api/admin/tenants/[id]
// pour `whiteLabel` : charger la row, reconstruire un TenantPlanState, appeler
// `tenantHasCapability`, répondre 402. Le recopier à chaque nouvelle capacité
// gatée, c'est accepter que les copies divergent — et une divergence, ici,
// s'appelle « le client paie et n'a pas », ou l'inverse.
//
// Le refus est un 402, pas un 403 : ce n'est pas une question de droit (le
// staff a bien la permission), c'est une question de palier.

import { supabaseAdmin } from './../supabase';
import { logger } from './../logger';
import {
  tenantHasCapability,
  PLAN_LABELS,
  type PlanFeatures,
  type PlanStatus,
  type TenantPlan,
} from './planFeatures';

/** Les capacités booléennes — les seules qui se gatent par oui/non. */
export type BooleanCapability = {
  [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never;
}[keyof PlanFeatures];

export type CapabilityDenial = {
  error: string;
  code: 'PLAN_CAPABILITY_REQUIRED';
  capability: BooleanCapability;
  plan: TenantPlan;
  planLabel: string;
};

/**
 * Le tenant a-t-il la capacité ? Rend `null` si oui, un corps de refus sinon.
 *
 * Ne jette jamais. Une lecture en erreur AUTORISE : un contrôle de palier
 * indisponible ne doit pas couper un client qui paie. C'est la même règle que
 * `assertPlanLimit` — le sens du refus doit être sûr, pas son absence.
 */
export async function capabilityDenial(
  tenantId: string,
  capability: BooleanCapability,
  message: string,
  nowMs: number = Date.now()
): Promise<CapabilityDenial | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data) {
    logger.error('[capabilityGate] tenant plan load error', error);
    return null;
  }

  const row = data as {
    plan?: string | null;
    plan_status?: string | null;
    plan_expires_at?: string | null;
  };
  const plan = (row.plan ?? 'discovery') as TenantPlan;
  const state = {
    plan,
    plan_status: (row.plan_status ?? 'active') as PlanStatus,
    plan_expires_at: row.plan_expires_at ?? null,
  };

  if (tenantHasCapability(state, capability, nowMs)) return null;

  return {
    error: message,
    code: 'PLAN_CAPABILITY_REQUIRED',
    capability,
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
  };
}
