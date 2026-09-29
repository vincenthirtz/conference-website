// features/admin/tenants/service/apiUsage.ts — panneau quota/usage du portail
// développeur : plan effectif, droits API et consommation minute / mois.
//
// LECTURE SEULE des compteurs `api_usage_counters` : n'appelle jamais
// `consume_api_usage` (réservé à la surface API, utils/billing/apiQuota.ts).
// Une ligne absente = `used = 0`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  effectivePlan,
  getPlanFeatures,
  type PlanStatus,
  type TenantPlan,
  type TenantPlanState,
} from '@/utils/billing/planFeatures';
import { minuteKey, monthKey } from '@/utils/billing/apiQuota';

/**
 * État de repli (ligne absente / lecture en échec) : fermé sur `discovery`
 * — on n'annonce jamais un droit payant sur un état inconnu.
 */
const FALLBACK_PLAN_STATE: TenantPlanState = {
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
};

async function loadTenantPlanState(
  ctx: ServiceContext
): Promise<TenantPlanState> {
  const { data, error } = await ctx.db
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  if (error) {
    ctx.logger.error('[admin/api-usage] tenant plan lookup error', error);
    return FALLBACK_PLAN_STATE;
  }
  if (!data) return FALLBACK_PLAN_STATE;

  return {
    plan: (data.plan as TenantPlan) ?? FALLBACK_PLAN_STATE.plan,
    plan_status:
      (data.plan_status as PlanStatus) ?? FALLBACK_PLAN_STATE.plan_status,
    plan_expires_at:
      (data.plan_expires_at as string | null) ??
      FALLBACK_PLAN_STATE.plan_expires_at,
  };
}

/** Compteur d'une fenêtre ; 0 si absent ou en erreur (panneau informatif). */
async function readCounter(
  ctx: ServiceContext,
  windowKind: 'minute' | 'month',
  windowKey: string
): Promise<number> {
  const { data, error } = await ctx.db
    .from('api_usage_counters')
    .select('count')
    .eq('tenant_id', ctx.tenantId)
    .eq('window_kind', windowKind)
    .eq('window_key', windowKey)
    .maybeSingle();

  if (error) {
    ctx.logger.error('[admin/api-usage] counter read error', error);
    return 0;
  }
  return Number((data?.count as number | undefined) ?? 0);
}

/** Limite du plan → contrat JSON (Infinity → null). */
function jsonLimit(limit: number): number | null {
  return Number.isFinite(limit) ? limit : null;
}

export async function getApiUsage(ctx: ServiceContext) {
  const now = new Date();
  const planState = await loadTenantPlanState(ctx);
  const effective = effectivePlan(planState, now.getTime());
  const features = getPlanFeatures(effective);

  const mKey = minuteKey(now);
  const moKey = monthKey(now);

  // Sans droit API, les compteurs ne sont même pas lus (écran verrouillé).
  const [minuteUsed, monthUsed] = features.apiRead
    ? await Promise.all([
        readCounter(ctx, 'minute', mKey),
        readCounter(ctx, 'month', moKey),
      ])
    : [0, 0];

  return {
    plan: planState.plan,
    effectivePlan: effective,
    apiRead: features.apiRead,
    apiWrite: features.apiWrite,
    minute: {
      used: minuteUsed,
      limit: features.apiRead ? jsonLimit(features.apiRateLimitPerMin) : 0,
    },
    month: {
      used: monthUsed,
      limit: features.apiRead ? jsonLimit(features.apiMonthlyQuota) : 0,
      key: moKey,
    },
    tokensHint:
      'Generate API tokens under Admin → API tokens. Authenticate with ' +
      'Authorization: Bearer <token>. Usage counts against your monthly quota ' +
      'and per-minute rate limit shown here.',
  };
}
