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
import { resolveOwnerEmails } from '@/utils/tenants/ownerEmails';
import { sendPlanRenewalReminderEmail } from '@/utils/email';
import {
  PLAN_LABELS,
  PLAN_GRACE_DAYS,
  planPrice,
  type PlanTerm,
  type PurchasablePlan,
} from '@/utils/billing/planFeatures';

const DAY_MS = 86_400_000;

type ReminderStage = {
  offsetDays: number;
  stage: 'before' | 'due' | 'grace';
};

/**
 * La séquence de relance (T10), en jours par rapport à l'échéance.
 *
 * Une seule relance à J-14 laissait tout le reste au silence : le jour de
 * l'échéance, et les sept jours de grâce qui suivent, ne disaient rien. Un
 * client découvrait la rétrogradation en constatant que son bot ne répond plus.
 *
 * La séquence DÉPEND de la périodicité. Écrite pour l'année, elle place la
 * première relance à J-14 : sur un cycle mensuel, c'est le milieu de la
 * période payée — on annoncerait une échéance à quelqu'un qui vient de payer,
 * puis trois fois encore dans le même mois. Un abonné mensuel reçoit donc trois
 * messages (J-3, le jour même, fin de grâce), pas quatre dont un prématuré.
 *
 * L'étape franchie se DÉDUIT de `plan_last_reminder_at` : une relance postée
 * avant la date d'une étape signifie que cette étape reste à envoyer. Pas de
 * colonne supplémentaire pour un état déductible d'une date.
 */
const REMINDER_STAGES: Record<PlanTerm, ReminderStage[]> = {
  year: [
    { offsetDays: -14, stage: 'before' },
    { offsetDays: -3, stage: 'before' },
    { offsetDays: 0, stage: 'due' },
    { offsetDays: PLAN_GRACE_DAYS, stage: 'grace' },
  ],
  month: [
    { offsetDays: -3, stage: 'before' },
    { offsetDays: 0, stage: 'due' },
    { offsetDays: PLAN_GRACE_DAYS, stage: 'grace' },
  ],
};

/**
 * Combien de jours avant l'échéance il vaut la peine de regarder un tenant.
 *
 * Se DÉDUIT de la première étape de sa séquence. La borne était un constante
 * séparée (14 j) : deux nombres à tenir d'accord, dont l'un se serait tu si
 * l'autre bougeait.
 */
function reminderWindowDays(term: PlanTerm): number {
  return -REMINDER_STAGES[term][0].offsetDays;
}

/** L'étape à envoyer maintenant, ou `null` s'il n'y a rien à dire. */
function dueStage(
  expMs: number,
  lastReminderMs: number,
  nowMs: number,
  term: PlanTerm
): ReminderStage | null {
  const stages = REMINDER_STAGES[term];
  // De la plus récente à la plus ancienne : on n'envoie jamais deux étapes le
  // même jour, et jamais une étape dépassée quand une plus récente est due.
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const s = stages[i];
    const at = expMs + s.offsetDays * DAY_MS;
    if (
      nowMs >= at &&
      !(Number.isFinite(lastReminderMs) && lastReminderMs >= at)
    ) {
      return s;
    }
  }
  return null;
}
/**
 * Recul appliqué à l'échéance pour définir « déjà relancé ce cycle » : une
 * relance dont l'horodatage est postérieur à `expiry - N j` compte comme la
 * relance du cycle courant (la fenêtre de relance est incluse dedans).
 *
 * 30 jours pour l'annuel. Sur un cycle MENSUEL, 30 jours couvrent le cycle
 * entier : la relance de fin de grâce du mois précédent (J+7, soit ~23 jours
 * avant l'échéance suivante) serait comptée comme celle du cycle en cours.
 * 10 jours laissent la frontière entre deux mois là où elle est.
 */
const CYCLE_LOOKBACK_DAYS: Record<PlanTerm, number> = { year: 30, month: 10 };

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
  plan_term: string | null;
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
      'id, plan, plan_status, plan_expires_at, plan_last_reminder_at, plan_is_trial, plan_term'
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

  for (const t of tenants) {
    try {
      const expMs = t.plan_expires_at ? Date.parse(t.plan_expires_at) : NaN;
      if (!Number.isFinite(expMs)) continue;

      // Périodicité payée. Une ligne antérieure à la colonne, ou une valeur
      // inattendue, vaut `year` : c'est ce que tous les espaces existants ont
      // effectivement payé.
      const term: PlanTerm = t.plan_term === 'month' ? 'month' : 'year';

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

      // 2) Séquence de relance : J-14, J-3, le jour même, puis J+7 (fin de la
      //    période de grâce). Un plan `past_due` reste relançable — c'est même
      //    là que la relance compte le plus.
      if (t.plan_status !== 'active' && t.plan_status !== 'past_due') continue;

      // Hors de la fenêtre utile : ni bientôt, ni récemment expiré.
      if (expMs > nowMs + reminderWindowDays(term) * DAY_MS) continue;

      const cycleThresholdMs = expMs - CYCLE_LOOKBACK_DAYS[term] * DAY_MS;
      const lastRaw = t.plan_last_reminder_at
        ? Date.parse(t.plan_last_reminder_at)
        : NaN;
      // Une relance d'un cycle précédent ne compte pas pour celui-ci.
      const lastMs =
        Number.isFinite(lastRaw) && lastRaw >= cycleThresholdMs ? lastRaw : NaN;

      const stage = dueStage(expMs, lastMs, nowMs, term);
      if (!stage) continue;

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
      // Le prix de CE QU'IL PAIE. La relance lisait le barème annuel sans
      // condition : un abonné mensuel à 29 € recevait une échéance à 290 €.
      const priceEur = planPrice(plan, term);
      const billingUrl = `${SITE_URL}/admin/billing`;

      for (const to of emails) {
        try {
          const r = await sendPlanRenewalReminderEmail({
            to,
            planLabel: PLAN_LABELS[plan] ?? plan,
            expiresAt: t.plan_expires_at as string,
            priceEur: typeof priceEur === 'number' ? priceEur : 0,
            term,
            billingUrl,
            // Un essai n'est pas un abonnement : la relance parle de fin
            // d'essai et de souscription, pas de renouvellement.
            isTrial: t.plan_is_trial === true,
            stage: stage.stage,
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
