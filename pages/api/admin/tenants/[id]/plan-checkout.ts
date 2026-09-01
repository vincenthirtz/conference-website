// pages/api/admin/tenants/[id]/plan-checkout.ts
//
// POST : génère un lien de paiement HelloAsso ciblé (tenant + plan) — modèle
// « Régie solidaire », Phase 1.
//
// Une fois un accord commercial passé, un owner génère ici un lien de « don »
// ciblé sur un tenant + un plan payant. On l'envoie au partenaire ; quand il
// paie, le webhook HelloAsso (pages/api/helloasso/webhook.ts) active /
// renouvelle automatiquement le plan du tenant.
//
// ── Corrélation don ↔ tenant/plan ───────────────────────────────────────────
// On attache `metadata: { kind:'tenant_plan', tenant_id, plan }` au
// checkout-intent HelloAsso (canal documenté, renvoyé dans le webhook). On
// stocke aussi un mapping `tenant_plan_checkouts` (checkout_intent_id →
// tenant/plan) comme fallback + audit. Voir utils/billing/tenantPlanBilling.ts.
//
// Auth : owner-only. Générer un lien engage financièrement une relation
// commerciale et modifie (in fine) le plan d'un tenant → rôle le plus élevé.
//
// Rate-limité 10/min par IP.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { formatZodError } from '@/utils/validation';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { createCheckoutIntent } from '@/utils/helloasso';
import {
  PLAN_PRICES_EUR,
  PLAN_LABELS,
  isPurchasablePlan,
} from '@/utils/billing/planFeatures';
import { buildPlanCheckoutMetadata } from '@/utils/billing/tenantPlanBilling';

const bodySchema = z.object({
  // Seuls les plans à barème catalogue (> 0) sont générables en self-service.
  plan: z
    .string()
    .refine(isPurchasablePlan, 'plan doit être "regie" ou "circuit".'),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'admin-tenants-plan-checkout'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_BODY' });
  }
  const { plan } = parsed.data;

  const priceEur = PLAN_PRICES_EUR[plan];
  if (typeof priceEur !== 'number' || priceEur <= 0) {
    // Garde-fou : isPurchasablePlan garantit déjà un prix > 0, mais on refuse
    // explicitement tout plan sans barème (ex. editor = sur-devis).
    return res
      .status(400)
      .json({ error: "Ce plan n'a pas de tarif catalogue.", code: 'NO_PRICE' });
  }

  // Le tenant doit exister (FK tenant_plan_checkouts + cohérence webhook).
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, plan')
    .eq('id', id)
    .maybeSingle();
  if (tenantErr) {
    logger.error(
      '[admin/tenants/plan-checkout] tenant lookup error',
      tenantErr
    );
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }
  // Le tenant flagship de l'association (`foundation`, gratuit à vie) n'est PAS
  // soumis à la facturation : générer un lien de paiement le ferait basculer sur
  // un plan payant. On refuse — invariant « l'association n'est jamais facturée ».
  if (tenant.plan === 'foundation') {
    return res.status(400).json({
      error: "Ce compte (Association) n'est pas soumis à la facturation.",
      code: 'NOT_BILLABLE',
    });
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const amountCents = priceEur * 100;

  let checkout: { id: number; redirectUrl: string };
  try {
    checkout = await createCheckoutIntent({
      totalAmount: amountCents,
      returnUrl: `${origin}/don?status=success`,
      errorUrl: `${origin}/don?status=error`,
      itemName: `Régie solidaire — plan ${PLAN_LABELS[plan]}`,
      metadata: buildPlanCheckoutMetadata(id, plan),
    });
  } catch (err) {
    logger.error('[admin/tenants/plan-checkout] checkout create error', err);
    return res.status(502).json({
      error: 'Impossible de créer le lien de paiement. Réessayez plus tard.',
    });
  }

  // Mapping fallback + audit : checkout_intent_id → tenant/plan.
  const { error: mapErr } = await supabaseAdmin
    .from('tenant_plan_checkouts')
    .insert({
      checkout_intent_id: checkout.id,
      tenant_id: id,
      plan,
      amount_expected: amountCents,
      created_by: ctx.staff.id,
    });
  if (mapErr) {
    // Non bloquant : le canal primaire reste la metadata HelloAsso. On log.
    logger.warn(
      '[admin/tenants/plan-checkout] checkout mapping insert failed',
      mapErr
    );
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tenant',
    entity_id: id,
    tenant_id: id,
    payload: {
      action: 'generate_plan_checkout',
      plan,
      amount_eur: priceEur,
      checkout_intent_id: checkout.id,
      tenant_slug: tenant.slug,
    },
  });

  return res.status(200).json({
    redirectUrl: checkout.redirectUrl,
    checkoutIntentId: checkout.id,
    plan,
    amountEur: priceEur,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
