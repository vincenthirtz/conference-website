// pages/api/admin/tenants/usage.ts
//
// GET : la consommation d'API de TOUS les espaces, sur la fenêtre du mois.
//
// `api_usage_counters` est alimenté à chaque appel authentifié depuis
// longtemps. Personne ne le lisait à l'échelle de la plateforme :
// `/api/admin/api-usage` est scopé à l'espace appelant et sert le tableau de
// bord développeur. L'owner ne pouvait donc répondre ni à « qui consomme quoi »,
// ni à « qui va taper le plafond avant la fin du mois ».
//
// Une seule requête par table, jamais de N+1 : on lit les espaces, puis les
// compteurs du mois en un `in`, et on recoud en mémoire.
//
// Portée : owner de la PLATEFORME (`manage_tenant` + `scope: 'platform'`).
// C'est une vue transverse — un propriétaire d'espace n'a pas à lire la
// consommation des autres.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { monthKey } from '@/utils/billing/apiQuota';
import {
  effectivePlan,
  getPlanFeatures,
  type PlanStatus,
  type TenantPlan,
} from '@/utils/billing/planFeatures';

export type TenantUsageRow = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  effectivePlan: TenantPlan;
  /** `null` = illimité. Un plafond absent n'est pas un plafond à zéro. */
  monthLimit: number | null;
  monthUsed: number;
  /** Part du quota consommée, 0-100+. `null` quand il n'y a pas de quota. */
  percent: number | null;
  lastCallAt: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tenants-usage'
    )
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const window =
    typeof req.query.window === 'string' ? req.query.window : 'month';
  if (window !== 'month') {
    return res.status(400).json({
      error: 'Only the month window is exposed.',
      code: 'INVALID_WINDOW',
    });
  }

  const { data: tenantRows, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, plan, plan_status, plan_expires_at')
    .order('slug');

  if (error) {
    logger.error('[admin/tenants-usage] tenants load error', error);
    return res.status(500).json({ error: 'Failed to load tenants.' });
  }

  const tenants = (tenantRows ?? []) as Array<{
    id: string;
    slug: string;
    name: string;
    plan: string | null;
    plan_status: string | null;
    plan_expires_at: string | null;
  }>;
  const ids = tenants.map((t) => t.id);
  const key = monthKey(new Date());

  const counters = new Map<string, { count: number; updated: string | null }>();
  if (ids.length > 0) {
    const { data: counterRows, error: cErr } = await supabaseAdmin
      .from('api_usage_counters')
      .select('tenant_id, count, updated_at')
      .eq('window_kind', 'month')
      .eq('window_key', key)
      .in('tenant_id', ids);
    if (cErr) {
      // Les compteurs manquants valent zéro : une vue de supervision qui
      // tombe entière parce qu'une table est indisponible ne sert personne.
      logger.error('[admin/tenants-usage] counters load error', cErr);
    }
    for (const row of (counterRows ?? []) as Array<{
      tenant_id: string;
      count: number | null;
      updated_at: string | null;
    }>) {
      counters.set(row.tenant_id, {
        count: row.count ?? 0,
        updated: row.updated_at,
      });
    }
  }

  const nowMs = Date.now();
  const rows: TenantUsageRow[] = tenants.map((t) => {
    const planState = {
      plan: (t.plan ?? 'discovery') as TenantPlan,
      plan_status: (t.plan_status ?? 'active') as PlanStatus,
      plan_expires_at: t.plan_expires_at ?? null,
    };
    const eff = effectivePlan(planState, nowMs);
    const quota = getPlanFeatures(eff).apiMonthlyQuota;
    const used = counters.get(t.id)?.count ?? 0;
    const limited = Number.isFinite(quota) && quota > 0;

    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: planState.plan,
      effectivePlan: eff,
      monthLimit: Number.isFinite(quota) ? quota : null,
      monthUsed: used,
      percent: limited ? Math.round((used / quota) * 100) : null,
      lastCallAt: counters.get(t.id)?.updated ?? null,
    };
  });

  // Les plus proches du mur d'abord : c'est la seule raison d'ouvrir cet écran.
  rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));

  return res.status(200).json({ window: 'month', windowKey: key, rows });
}

export default withStaffRoute(handler, {
  permission: 'manage_tenant',
  scope: 'platform',
});
