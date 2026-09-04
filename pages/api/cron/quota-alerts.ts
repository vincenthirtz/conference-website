// pages/api/cron/quota-alerts.ts
//
// Prévient AVANT le mur : un espace qui approche son quota d'API mensuel doit
// l'apprendre par un email, pas par des 429 en pleine journée de matchs.
//
// Deux seuils, une fois chacun par fenêtre mensuelle : 80 % (il reste le temps
// de faire quelque chose) et 100 % (c'est fait, les appels sont refusés).
// `api_usage_counters.alerted_threshold` retient le dernier seuil annoncé —
// sans lui, un espace à 85 % recevrait le même email tous les jours jusqu'à la
// fin du mois, et une alerte quotidienne cesse d'être lue au troisième jour.
//
// Destinataires : les propriétaires DE L'ESPACE (leur quota, leur décision).
// L'email part avec le compte d'envoi de l'espace, comme tout ce qui le
// concerne ; un espace sans compte d'envoi ne reçoit rien, et le cron le dit
// dans ses compteurs plutôt que de faire semblant.
//
// Auth CRON_SECRET fail-closed. Résilient : une erreur par espace n'arrête pas
// la boucle.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { sendEmail } from '@/utils/email';
import { monthKey } from '@/utils/billing/apiQuota';
import { resolveOwnerEmails } from '@/utils/tenants/ownerEmails';
import {
  effectivePlan,
  getPlanFeatures,
  type PlanStatus,
  type TenantPlan,
} from '@/utils/billing/planFeatures';

/** Ordre décroissant : on annonce toujours le seuil le plus haut atteint. */
const THRESHOLDS = [100, 80] as const;

function checkAuth(req: NextApiRequest): 'missing' | 'ok' | 'mismatch' {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/quota-alerts] CRON_SECRET not configured — refusing');
    return 'missing';
  }
  const header = req.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : '';
  const query = typeof req.query.secret === 'string' ? req.query.secret : '';
  return bearer === secret || query === secret ? 'ok' : 'mismatch';
}

function body(opts: {
  tenantName: string;
  used: number;
  limit: number;
  percent: number;
  reached100: boolean;
}) {
  const subject = opts.reached100
    ? `Quota d'API atteint — ${opts.tenantName}`
    : `Quota d'API bientôt atteint — ${opts.tenantName}`;
  const lead = opts.reached100
    ? `Le quota d'appels API de ce mois est atteint : les requêtes authentifiées sont refusées jusqu'au 1<sup>er</sup> du mois prochain.`
    : `Le quota d'appels API de ce mois est consommé à ${opts.percent} %.`;
  return {
    subject,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#C6BED9;">
  <h1 style="font-size:19px;color:#ffffff;margin:0 0 12px;">${subject}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">${lead}</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
    Consommé : <strong style="color:#ffffff;">${opts.used.toLocaleString('fr-FR')}</strong>
    sur ${opts.limit.toLocaleString('fr-FR')} appels.
  </p>
  <p style="font-size:13px;line-height:1.5;color:#8E85A6;margin:0;">
    Le compteur repart à zéro le 1<sup>er</sup> du mois. Un plan supérieur relève
    la limite si ce plafond devient la norme plutôt que l'exception.
  </p>
</div>`.trim(),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = checkAuth(req);
  if (auth === 'missing') {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (auth === 'mismatch') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = monthKey(new Date());

  const { data: counterRows, error } = await supabaseAdmin
    .from('api_usage_counters')
    .select('tenant_id, count, alerted_threshold')
    .eq('window_kind', 'month')
    .eq('window_key', key);

  if (error) {
    logger.error('[cron/quota-alerts] counters load error', error);
    return res.status(500).json({ error: 'Failed to load counters.' });
  }

  const counters = (counterRows ?? []) as Array<{
    tenant_id: string;
    count: number | null;
    alerted_threshold: number | null;
  }>;
  if (counters.length === 0) {
    return res.status(200).json({ checked: 0, alerted: 0, skipped: 0 });
  }

  const { data: tenantRows } = await supabaseAdmin
    .from('tenants')
    .select('id, name, plan, plan_status, plan_expires_at')
    .in(
      'id',
      counters.map((c) => c.tenant_id)
    );

  const byId = new Map(
    (
      (tenantRows ?? []) as Array<{
        id: string;
        name: string;
        plan: string | null;
        plan_status: string | null;
        plan_expires_at: string | null;
      }>
    ).map((t) => [t.id, t])
  );

  const nowMs = Date.now();
  let alerted = 0;
  let skipped = 0;

  for (const counter of counters) {
    const tenant = byId.get(counter.tenant_id);
    if (!tenant) continue;

    const quota = getPlanFeatures(
      effectivePlan(
        {
          plan: (tenant.plan ?? 'discovery') as TenantPlan,
          plan_status: (tenant.plan_status ?? 'active') as PlanStatus,
          plan_expires_at: tenant.plan_expires_at ?? null,
        },
        nowMs
      )
    ).apiMonthlyQuota;

    // Illimité, ou quota nul (plan sans API) : il n'y a pas de mur à annoncer.
    if (!Number.isFinite(quota) || quota <= 0) continue;

    const used = counter.count ?? 0;
    const percent = Math.round((used / quota) * 100);
    const threshold = THRESHOLDS.find((t) => percent >= t);
    if (!threshold) continue;
    // Déjà annoncé, à ce seuil ou plus haut, sur cette fenêtre.
    if ((counter.alerted_threshold ?? 0) >= threshold) {
      skipped += 1;
      continue;
    }

    try {
      const emails = await resolveOwnerEmails(counter.tenant_id);
      const mail = body({
        tenantName: tenant.name,
        used,
        limit: quota,
        percent,
        reached100: threshold === 100,
      });
      let sentAny = false;
      for (const to of emails) {
        const sent = await sendEmail({
          tenantId: counter.tenant_id,
          to,
          subject: mail.subject,
          html: mail.html,
        });
        sentAny = sentAny || sent.success === true;
      }

      // On marque le seuil MÊME sans email parti : sinon un espace sans compte
      // d'envoi ferait rejouer la tentative chaque jour, sans jamais aboutir.
      await supabaseAdmin
        .from('api_usage_counters')
        .update({
          alerted_at: new Date().toISOString(),
          alerted_threshold: threshold,
        })
        .eq('tenant_id', counter.tenant_id)
        .eq('window_kind', 'month')
        .eq('window_key', key);

      if (sentAny) alerted += 1;
      else skipped += 1;
    } catch (err) {
      logger.error('[cron/quota-alerts] tenant failed', {
        tenantId: counter.tenant_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res
    .status(200)
    .json({ checked: counters.length, alerted, skipped, windowKey: key });
}
