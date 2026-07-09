// pages/api/cron/scrim-planning-reminders.ts
//
// Scheduled function (Netlify, via netlify/functions/scrim-planning-reminders-cron.ts)
// qui relance les participants d'une grille de dispo scrim OUVERTE dont
// l'horizon approche et pour laquelle une équipe n'a pas encore peint de
// créneau.
//
// Pour chaque grille éligible :
//   1. Émet un event `scrim.planning.reminder` (outbox → push/email fanout vers
//      capitaines/managers des 2 équipes + staff, cf. web-push-dispatch).
//   2. Estampille `scrim_plannings.reminder_pinged_at = now()` pour ne relancer
//      qu'une seule fois par grille (même pattern que dispute.sla_breached →
//      matches.escalation_pinged_at).
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query), comme les autres
// endpoints /api/cron/*.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { emitScrimPlanningEvent } from '@/utils/scrimPlanningEvents';
import { logger } from '@/utils/logger';

// On relance quand l'horizon commence dans <= REMIND_DAYS_BEFORE jours.
const REMIND_DAYS_BEFORE = 2;

type Counters = {
  tenants_scanned: number;
  plannings_scanned: number;
  reminders_emitted: number;
  duration_ms: number;
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/scrim-planning-reminders] CRON_SECRET absent — refus');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

function ymdPlusDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function runScrimPlanningReminders(): Promise<Counters> {
  const start = Date.now();
  const counters: Counters = {
    tenants_scanned: 0,
    plannings_scanned: 0,
    reminders_emitted: 0,
    duration_ms: 0,
  };

  if (!supabaseAdmin) {
    counters.duration_ms = Date.now() - start;
    return counters;
  }

  const { data: tenants, error: tErr } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('is_active', true);
  if (tErr) {
    logger.error('[cron/scrim-planning-reminders] tenants fetch error', tErr);
    counters.duration_ms = Date.now() - start;
    return counters;
  }

  const horizonCutoff = ymdPlusDays(REMIND_DAYS_BEFORE);
  const nowIso = new Date().toISOString();

  for (const tenant of (tenants ?? []) as Array<{ id: string }>) {
    counters.tenants_scanned += 1;

    // Grilles ouvertes, non encore relancées, dont l'horizon commence bientôt.
    const { data: plannings } = await supabaseAdmin
      .from('scrim_plannings')
      .select(
        'id, team1_id, team2_id, title, game, status, horizon_start, horizon_days, validated_slot, scrim_id'
      )
      .eq('tenant_id', tenant.id)
      .eq('status', 'open')
      .is('deleted_at', null)
      .is('reminder_pinged_at', null)
      .lte('horizon_start', horizonCutoff);

    for (const planning of plannings ?? []) {
      counters.plannings_scanned += 1;

      // Quelles parties ont déjà peint au moins un créneau ?
      const { data: avails } = await supabaseAdmin
        .from('scrim_planning_availabilities')
        .select('party, slots')
        .eq('planning_id', planning.id);
      const painted = new Set<string>();
      for (const a of avails ?? []) {
        if (Array.isArray(a.slots) && (a.slots as unknown[]).length > 0) {
          painted.add(a.party as string);
        }
      }

      // On relance dès qu'une des DEUX équipes manque (le staff est optionnel).
      const missingTeams = ['team1', 'team2'].filter((p) => !painted.has(p));
      if (missingTeams.length > 0) {
        try {
          await emitScrimPlanningEvent(
            'scrim.planning.reminder',
            planning as never,
            tenant.id,
            { missingParties: missingTeams }
          );
          counters.reminders_emitted += 1;
        } catch (e) {
          logger.error(
            '[cron/scrim-planning-reminders] emit error planning=%s',
            planning.id,
            e
          );
        }
      }

      // Estampille dans tous les cas : une seule passe de relance par grille
      // (si les 2 équipes ont déjà peint, rien à relancer non plus).
      await supabaseAdmin
        .from('scrim_plannings')
        .update({ reminder_pinged_at: nowIso })
        .eq('id', planning.id)
        .eq('tenant_id', tenant.id);
    }
  }

  counters.duration_ms = Date.now() - start;
  return counters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST,GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const counters = await runScrimPlanningReminders();
    logger.info(
      '[cron/scrim-planning-reminders] tick tenants=%d plannings=%d emitted=%d duration_ms=%d',
      counters.tenants_scanned,
      counters.plannings_scanned,
      counters.reminders_emitted,
      counters.duration_ms
    );
    return res.status(200).json(counters);
  } catch (err) {
    logger.error('[cron/scrim-planning-reminders] handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
