// GET /api/admin/api-usage
//
// READ-ONLY usage/quota panel for the SELF-SERVE DEVELOPER PORTAL (axis 03).
// Powers the developer dashboard: shows the current tenant's effective plan,
// its API entitlements, and how much of the authenticated-API quota it has
// already consumed for the current minute + month windows.
//
// This endpoint only READS the durable `api_usage_counters` rows — it never
// calls `consume_api_usage` (that RPC is reserved for the actual API surface,
// see utils/billing/apiQuota.ts). No counter is created here; a missing row
// simply means `used = 0`.
//
// Auth: withStaffRoute(handler, 'admin') — scoped to ctx.tenantId. GET only.
// `Cache-Control: no-store` (live numbers, per-tenant, never cache).

import type { NextApiRequest, NextApiResponse } from 'next';

import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  effectivePlan,
  getPlanFeatures,
  type PlanStatus,
  type TenantPlan,
  type TenantPlanState,
} from '@/utils/billing/planFeatures';
import { minuteKey, monthKey } from '@/utils/billing/apiQuota';

/**
 * Fallback plan state when the tenant row is missing / the lookup fails.
 * Fail-closed on `discovery` (no API entitlement) — we never want to advertise
 * a paid entitlement on an unknown state.
 */
const FALLBACK_PLAN_STATE: TenantPlanState = {
  plan: 'discovery',
  plan_status: 'active',
  plan_expires_at: null,
};

async function loadTenantPlanState(tenantId: string): Promise<TenantPlanState> {
  if (!supabaseAdmin) return FALLBACK_PLAN_STATE;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_status, plan_expires_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[admin/api-usage] tenant plan lookup error', error);
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

/**
 * Read (do NOT consume) the current counter for a single fixed-window row.
 * Returns 0 when no row exists yet. Fail-open to 0 on infra error — this panel
 * is informational and must never 500 the dashboard over a counter read.
 */
async function readCounter(
  tenantId: string,
  windowKind: 'minute' | 'month',
  windowKey: string
): Promise<number> {
  if (!supabaseAdmin) return 0;
  const { data, error } = await supabaseAdmin
    .from('api_usage_counters')
    .select('count')
    .eq('tenant_id', tenantId)
    .eq('window_kind', windowKind)
    .eq('window_key', windowKey)
    .maybeSingle();

  if (error) {
    logger.error('[admin/api-usage] counter read error', error);
    return 0;
  }
  return Number((data?.count as number | undefined) ?? 0);
}

/** Map an Infinity/0/finite plan limit to the JSON contract (Infinity → null). */
function jsonLimit(limit: number): number | null {
  return Number.isFinite(limit) ? limit : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const now = new Date();
  const planState = await loadTenantPlanState(ctx.tenantId);
  const effective = effectivePlan(planState, now.getTime());
  const features = getPlanFeatures(effective);

  const mKey = minuteKey(now);
  const moKey = monthKey(now);

  // Read both windows. No entitlement → don't even hit the counters (used = 0,
  // limit = 0): the UI shows a locked state + upgrade CTA.
  const [minuteUsed, monthUsed] = features.apiRead
    ? await Promise.all([
        readCounter(ctx.tenantId, 'minute', mKey),
        readCounter(ctx.tenantId, 'month', moKey),
      ])
    : [0, 0];

  res.status(200).json({
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
  });
}

export default withStaffRoute(handler, 'admin');
