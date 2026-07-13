// pages/api/admin/tenants/[id]/billing.ts
//
// GET : état de facturation d'un tenant pour l'UI self-serve « Régie solidaire ».
//
// Lecture seule. `withStaffRoute(handler, 'admin')` : un admin du tenant peut
// CONSULTER l'état d'abonnement + l'historique de paiements ; l'ACHAT (génération
// du lien HelloAsso) reste owner-only via plan-checkout.ts — on ne le duplique
// pas ici.
//
// Scope : le tenant demandé doit être le tenant actif du staff (ctx.tenantId),
// sauf pour un pôle-admin cross-tenant. Empêche un admin scopé au tenant A de
// lire la facturation du tenant B en devinant son UUID.
//
// Le plan EFFECTIF (effectivePlan) et les capabilities reflètent l'entitlement :
// un plan payant expiré / past_due retombe sur `discovery` — c'est ce que l'UI
// affiche comme capacités réellement accordées, en plus du plan « facturé » brut.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import {
  PLAN_LABELS,
  PLAN_PRICES_EUR,
  effectivePlan,
  getPlanFeatures,
  type TenantPlan,
  type PlanStatus,
} from '@/utils/billing/planFeatures';

const DAY_MS = 86_400_000;

type TenantRow = {
  id: string;
  plan: string;
  plan_status: string;
  plan_started_at: string | null;
  plan_expires_at: string | null;
};

type PaymentRow = {
  id: number | string;
  plan: string;
  amount: number;
  helloasso_payment_id: number | string;
  applied_at: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  // Scope : tenant actif du staff, ou pôle-admin cross-tenant.
  const isPoleAdmin =
    (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
  if (id !== ctx.tenantId && !isPoleAdmin) {
    return res.status(403).json({ error: 'Forbidden.', code: 'TENANT_SCOPE' });
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, plan, plan_status, plan_started_at, plan_expires_at')
    .eq('id', id)
    .maybeSingle();
  if (tenantErr) {
    logger.error('[admin/tenants/billing] tenant lookup error', tenantErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }
  const t = tenant as TenantRow;

  const plan = t.plan as TenantPlan;
  const planStatus = t.plan_status as PlanStatus;
  const planExpiresAt = t.plan_expires_at ?? null;
  const planStartedAt = t.plan_started_at ?? null;

  const nowMs = Date.now();
  const daysRemaining =
    planExpiresAt !== null
      ? Math.max(0, Math.ceil((Date.parse(planExpiresAt) - nowMs) / DAY_MS))
      : null;

  const eff = effectivePlan(
    { plan, plan_status: planStatus, plan_expires_at: planExpiresAt },
    nowMs
  );
  const capabilities = getPlanFeatures(eff);

  // Historique de paiements récents (desc). Best-effort : une erreur de lecture
  // ne casse pas l'affichage de l'état d'abonnement (on renvoie une liste vide).
  const { data: payData, error: payErr } = await supabaseAdmin
    .from('tenant_plan_payments')
    .select('id, plan, amount, helloasso_payment_id, applied_at')
    .eq('tenant_id', id)
    .order('applied_at', { ascending: false })
    .limit(20);
  if (payErr) {
    logger.error('[admin/tenants/billing] payments lookup error', payErr);
  }
  const payments = ((payData ?? []) as PaymentRow[]).map((p) => ({
    id: p.id,
    plan: p.plan,
    amountCents: p.amount,
    paidAt: p.applied_at,
    helloassoPaymentId: p.helloasso_payment_id,
  }));

  // Catalogue self-service : uniquement les plans à barème catalogue (> 0).
  const catalog = (['regie', 'circuit'] as const).map((p) => ({
    plan: p,
    label: PLAN_LABELS[p],
    priceEur: PLAN_PRICES_EUR[p] as number,
  }));

  return res.status(200).json({
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
    planStatus,
    planStartedAt,
    planExpiresAt,
    daysRemaining,
    effectivePlan: eff,
    capabilities,
    catalog,
    payments,
  });
}

export default withStaffRoute(handler, 'admin');
