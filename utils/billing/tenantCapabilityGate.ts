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
/**
 * Le palier d'un espace, gardé en mémoire une minute.
 *
 * POURQUOI. Ce contrôle est appelé par TOUTES les routes d'overlay, à chaque
 * tick. Une source de régie interroge toutes les 5 s pendant six heures, soit
 * 720 lectures par heure d'une ligne qui change… quand quelqu'un change
 * d'offre. C'est une part mesurable du compteur d'API Supabase (8 000
 * requêtes en une heure le 2026-09-23).
 *
 * LA MINUTE DE RETARD EST ASSUMÉE. Un palier qui vient d'expirer reste ouvert
 * jusqu'à soixante secondes : sur une facturation mensuelle, c'est sans
 * conséquence, et l'inverse — couper une source en plein direct à la seconde
 * près — serait bien pire.
 *
 * Cache PAR INSTANCE (Netlify Functions) : il ne se partage pas entre lambdas
 * et disparaît au recyclage. C'est suffisant ici, parce que les ticks d'une
 * même source tombent sur la même instance tant qu'elle vit.
 */
const PLAN_TTL_MS = 60_000;
type PlanCacheEntry = {
  row: {
    plan?: string | null;
    plan_status?: string | null;
    plan_expires_at?: string | null;
  } | null;
  expiresAt: number;
};
const planCache = new Map<string, PlanCacheEntry>();

/** Reset du cache. À usage strictement test. */
export function __resetPlanCacheForTests(): void {
  planCache.clear();
}

export async function capabilityDenial(
  tenantId: string,
  capability: BooleanCapability,
  message: string,
  nowMs: number = Date.now()
): Promise<CapabilityDenial | null> {
  const cached = planCache.get(tenantId);
  let data = cached && cached.expiresAt > nowMs ? cached.row : undefined;

  if (data === undefined) {
    const res = await supabaseAdmin
      .from('tenants')
      .select('plan, plan_status, plan_expires_at')
      .eq('id', tenantId)
      .maybeSingle();

    if (res.error) {
      logger.error('[capabilityGate] tenant plan load error', res.error);
      return null;
    }
    data = (res.data ?? null) as PlanCacheEntry['row'];
    // On mémorise AUSSI l'absence : un espace inconnu interrogé à chaque tick
    // coûterait autant qu'un espace connu.
    planCache.set(tenantId, { row: data, expiresAt: nowMs + PLAN_TTL_MS });
  }

  if (!data) {
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
