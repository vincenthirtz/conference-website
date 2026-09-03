// pages/api/cron/plan-renewal.ts
//
// Cycle de vie des abonnements org self-serve (« Régie solidaire », axe 06 —
// revenu récurrent). Déclenché une fois par jour par la Netlify Scheduled
// Function `plan-renewal-cron`.
//
// Sur les tenants aux plans PAYANTS (`regie` / `circuit`) uniquement :
//
//   1. EXPIRATION → past_due : un plan `active` dont `plan_expires_at` est passé
//      bascule en `plan_status='past_due'`. Les capacités retombent déjà seules
//      sur `discovery` via effectivePlan() ; cette bascule rend le cycle de vie
//      explicite et alimente le badge d'état de l'UI.
//
//   2. RELANCE de renouvellement : un plan `active` qui expire dans les 14 jours
//      et n'a pas encore été relancé sur CE cycle (plan_last_reminder_at NULL ou
//      antérieur à `plan_expires_at - 30j`) → email FR aux owner(s) du tenant,
//      puis `plan_last_reminder_at = now`. La borne « - 30j » garantit une seule
//      relance par cycle annuel (après paiement, la colonne est remise à NULL,
//      cf. applyTenantPlanPayment).
//
// Jamais de traitement des tenants foundation / discovery / editor (pas de
// barème catalogue self-serve). Résilient : try/catch PAR tenant, on continue
// toujours ; l'envoi d'email est non-fatal (log + on poursuit). Auth
// CRON_SECRET fail-closed, calquée sur webhook-dispatch.ts.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { sendPlanRenewalReminderEmail } from '@/utils/email';
import {
  PLAN_LABELS,
  PLAN_PRICES_EUR,
  type PurchasablePlan,
} from '@/utils/billing/planFeatures';

const DAY_MS = 86_400_000;
/** Fenêtre de relance avant expiration. */
const REMINDER_WINDOW_DAYS = 14;
/**
 * Recul appliqué à l'échéance pour définir « déjà relancé ce cycle » : une
 * relance dont l'horodatage est postérieur à `expiry - 30j` compte comme la
 * relance du cycle courant (la fenêtre de relance de 14j est incluse dedans).
 */
const CYCLE_LOOKBACK_DAYS = 30;

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://owwomenscup.fr';

let _inFlight = false;

/**
 * Auth CRON_SECRET, fail-closed :
 *   - secret non configuré → `missing` (le handler répond 500 : mauvaise conf
 *     serveur, pas une requête invalide) ;
 *   - Bearer header ou `?secret=` correct → `ok` ;
 *   - sinon → `mismatch` (401).
 */
function checkAuth(req: NextApiRequest): 'missing' | 'ok' | 'mismatch' {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/plan-renewal] CRON_SECRET not configured — refusing');
    return 'missing';
  }
  if (req.headers.authorization === `Bearer ${secret}`) return 'ok';
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return 'ok';
  return 'mismatch';
}

type TenantRow = {
  id: string;
  plan: string;
  plan_status: string;
  plan_expires_at: string | null;
  plan_last_reminder_at: string | null;
  plan_is_trial?: boolean | null;
};

export type PlanRenewalCounters = {
  checked: number;
  markedPastDue: number;
  /** Essais arrivés à échéance et redescendus sur `discovery`. */
  trialsEnded: number;
  remindersSent: number;
  errors: number;
};

/**
 * Résout les emails des owner(s) d'un tenant : staff scopés au tenant
 * (tenant_staff) dont le rôle staff est `owner` et qui sont actifs, puis email
 * via l'API admin auth. Dédupliqué. Best-effort : une résolution qui échoue
 * renvoie [] plutôt que de jeter.
 */
async function resolveOwnerEmails(tenantId: string): Promise<string[]> {
  const { data: tsRows, error: tsErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id')
    .eq('tenant_id', tenantId);
  if (tsErr) {
    logger.error('[cron/plan-renewal] tenant_staff load error', tsErr);
    return [];
  }
  const staffIds = ((tsRows ?? []) as Array<{ staff_id: string }>)
    .map((r) => r.staff_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (staffIds.length === 0) return [];

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('auth_user_id, role, is_active, deleted_at')
    .in('id', staffIds);
  if (staffErr) {
    logger.error('[cron/plan-renewal] staff load error', staffErr);
    return [];
  }

  const owners = (
    (staffRows ?? []) as Array<{
      auth_user_id: string | null;
      role: string | null;
      is_active?: boolean | null;
      deleted_at?: string | null;
    }>
  ).filter(
    (r) =>
      r.role === 'owner' &&
      r.is_active !== false &&
      !r.deleted_at &&
      typeof r.auth_user_id === 'string' &&
      r.auth_user_id.length > 0
  );

  const emails = new Set<string>();
  for (const o of owners) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        o.auth_user_id as string
      );
      if (error || !data?.user) continue;
      const email = data.user.email;
      if (typeof email === 'string' && email.length > 0) emails.add(email);
    } catch (err) {
      logger.error(
        '[cron/plan-renewal] getUserById error for %s',
        o.auth_user_id,
        err
      );
    }
  }
  return Array.from(emails);
}

export async function runPlanRenewal(
  nowMs: number = Date.now()
): Promise<PlanRenewalCounters> {
  const counters: PlanRenewalCounters = {
    checked: 0,
    markedPastDue: 0,
    trialsEnded: 0,
    remindersSent: 0,
    errors: 0,
  };

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, plan, plan_status, plan_expires_at, plan_last_reminder_at, plan_is_trial'
    )
    .in('plan', ['regie', 'circuit']);
  if (error) {
    logger.error('[cron/plan-renewal] tenants load error', error);
    counters.errors += 1;
    return counters;
  }

  const tenants = (data ?? []) as TenantRow[];
  counters.checked = tenants.length;

  const nowIso = new Date(nowMs).toISOString();
  const windowEndMs = nowMs + REMINDER_WINDOW_DAYS * DAY_MS;

  for (const t of tenants) {
    try {
      const expMs = t.plan_expires_at ? Date.parse(t.plan_expires_at) : NaN;
      if (!Number.isFinite(expMs)) continue;

      // 1) Expiration.
      //
      // Un abonnement payé bascule en `past_due` : il y a une créance, et
      // l'état doit le dire. Un ESSAI, lui, n'a jamais rien dû — le laisser en
      // `past_due` afficherait un impayé fictif. Il retombe donc proprement
      // sur le palier gratuit `discovery`, statut actif. Dans les deux cas les
      // capacités tombent au même endroit (effectivePlan).
      if (t.plan_status === 'active' && expMs < nowMs) {
        const isTrial = t.plan_is_trial === true;
        const { error: updErr } = await supabaseAdmin
          .from('tenants')
          .update(
            isTrial
              ? {
                  plan: 'discovery',
                  plan_status: 'active',
                  plan_is_trial: false,
                  plan_expires_at: null,
                }
              : { plan_status: 'past_due' }
          )
          .eq('id', t.id);
        if (updErr) {
          logger.error(
            '[cron/plan-renewal] past_due update error for %s',
            t.id,
            updErr
          );
          counters.errors += 1;
        } else if (isTrial) {
          counters.trialsEnded += 1;
        } else {
          counters.markedPastDue += 1;
        }
        continue; // Plus actif → pas de relance ce run.
      }

      // 2) Relance de renouvellement (plan actif, expire bientôt, pas déjà
      //    relancé ce cycle).
      if (t.plan_status !== 'active') continue;
      const expiresSoon = expMs >= nowMs && expMs <= windowEndMs;
      if (!expiresSoon) continue;

      const cycleThresholdMs = expMs - CYCLE_LOOKBACK_DAYS * DAY_MS;
      const lastMs = t.plan_last_reminder_at
        ? Date.parse(t.plan_last_reminder_at)
        : NaN;
      const alreadyReminded =
        Number.isFinite(lastMs) && lastMs >= cycleThresholdMs;
      if (alreadyReminded) continue;

      const emails = await resolveOwnerEmails(t.id);
      if (emails.length === 0) {
        // Pas d'owner résolu → on ne stampe PAS, pour relancer dès qu'un owner
        // (avec email) existe. Sans effet sur les compteurs.
        logger.warn(
          '[cron/plan-renewal] no owner email for tenant %s — skipping reminder',
          t.id
        );
        continue;
      }

      const plan = t.plan as PurchasablePlan;
      const priceEur = PLAN_PRICES_EUR[plan];
      const billingUrl = `${SITE_URL}/admin/billing`;

      for (const to of emails) {
        try {
          const r = await sendPlanRenewalReminderEmail({
            to,
            planLabel: PLAN_LABELS[plan] ?? plan,
            expiresAt: t.plan_expires_at as string,
            priceEur: typeof priceEur === 'number' ? priceEur : 0,
            billingUrl,
            // Un essai n'est pas un abonnement : la relance parle de fin
            // d'essai et de souscription, pas de renouvellement.
            isTrial: t.plan_is_trial === true,
          });
          if (!r.success) {
            logger.error(
              '[cron/plan-renewal] reminder email failed for %s: %s',
              t.id,
              r.error
            );
          }
        } catch (err) {
          // Non-fatal : un échec d'envoi n'avorte ni le tenant ni le run.
          logger.error(
            '[cron/plan-renewal] reminder email threw for %s',
            t.id,
            err
          );
        }
      }

      // Stampe la relance du cycle (même si un envoi individuel a échoué : on ne
      // re-spamme pas les autres owners à chaque run).
      const { error: stampErr } = await supabaseAdmin
        .from('tenants')
        .update({ plan_last_reminder_at: nowIso })
        .eq('id', t.id);
      if (stampErr) {
        logger.error(
          '[cron/plan-renewal] reminder stamp error for %s',
          t.id,
          stampErr
        );
        counters.errors += 1;
      } else {
        counters.remindersSent += 1;
      }
    } catch (err) {
      // Résilience : un tenant qui explose n'avorte jamais le run.
      logger.error('[cron/plan-renewal] tenant %s failed', t.id, err);
      counters.errors += 1;
    }
  }

  return counters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = checkAuth(req);
  if (auth === 'missing') {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth === 'mismatch') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  if (_inFlight) {
    logger.warn('[cron/plan-renewal] previous tick still in flight — skipping');
    return res.status(200).json({ success: true, skipped: 'in_flight' });
  }
  _inFlight = true;
  try {
    const counters = await runPlanRenewal();
    logger.info(
      '[cron/plan-renewal] tick checked=%d markedPastDue=%d remindersSent=%d errors=%d',
      counters.checked,
      counters.markedPastDue,
      counters.remindersSent,
      counters.errors
    );
    return res.status(200).json({ success: true, ...counters });
  } catch (err) {
    logger.error('[cron/plan-renewal] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    _inFlight = false;
  }
}
