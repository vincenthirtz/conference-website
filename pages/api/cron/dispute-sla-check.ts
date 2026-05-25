// pages/api/cron/dispute-sla-check.ts
//
// Lot 4 — Scheduled function (Netlify, every 5 min via
// netlify/functions/dispute-sla-cron.ts) that scans every active tenant
// for disputes that have crossed the `tenants.dispute_sla_minutes`
// threshold and haven't been pinged yet.
//
// For each breach :
//   1. Emit a `dispute.sla_breached` outbox event with enriched payload
//      (matchId, tournamentId, age, sla, dispute reason). The bot poller
//      picks this up and DMs the staff role configured for the tenant.
//   2. Stamp `matches.escalation_pinged_at = now()` so the next tick
//      skips this match — single escalation per breach.
//
// Auth : Bearer CRON_SECRET (header) or ?secret=... (query), same shape
// as the other /api/cron/* endpoints.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import {
  findUnpingedBreaches,
  markEscalationPinged,
} from '@/utils/disputes/slaBreaches';
import { logger } from '@/utils/logger';

type Counters = {
  tenants_scanned: number;
  breaches_found: number;
  events_emitted: number;
  duration_ms: number;
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/dispute-sla] CRON_SECRET not configured — refusing');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

export async function runDisputeSlaCheck(): Promise<Counters> {
  const start = Date.now();
  const counters: Counters = {
    tenants_scanned: 0,
    breaches_found: 0,
    events_emitted: 0,
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
    logger.error('[cron/dispute-sla] tenants fetch error', tErr);
    counters.duration_ms = Date.now() - start;
    return counters;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  for (const tenant of (tenants ?? []) as Array<{ id: string }>) {
    counters.tenants_scanned += 1;

    const breaches = await findUnpingedBreaches(tenant.id, nowMs);
    if (breaches.length === 0) continue;
    counters.breaches_found += breaches.length;

    // Emit one event per breach so the bot can route each to the right
    // captain pair / Discord thread independently.
    const emittedMatchIds: string[] = [];
    for (const b of breaches) {
      try {
        // Enrich avec le threadId du forum dispute pour que le bot poste
        // directement dans le thread existant (cree au `match.disputed`).
        // Best-effort : si enrich rate, on emit sans enriched et le bot
        // fait son propre fallback.
        const enriched = await enrichMatchEvent(b.matchId).catch(() => null);
        await emitBotEvent(
          'dispute.sla_breached',
          {
            matchId: b.matchId,
            tournamentId: b.tournamentId,
            disputeReason: b.disputeReason,
            disputeOpenedAt: b.disputeOpenedAt,
            ageMinutes: b.ageMinutes,
            slaMinutes: b.slaMinutes,
            enriched,
          },
          tenant.id
        );
        counters.events_emitted += 1;
        emittedMatchIds.push(b.matchId);
      } catch (e) {
        logger.error(
          '[cron/dispute-sla] emitBotEvent error for match %s',
          b.matchId,
          e
        );
      }
    }

    // Mark only the matches whose event made it to outbox. A failed emit
    // leaves escalation_pinged_at = null so the next tick retries.
    if (emittedMatchIds.length > 0) {
      await markEscalationPinged(tenant.id, emittedMatchIds, nowIso);
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
    const counters = await runDisputeSlaCheck();
    logger.info(
      '[cron/dispute-sla] tick done tenants=%d breaches=%d emitted=%d duration_ms=%d',
      counters.tenants_scanned,
      counters.breaches_found,
      counters.events_emitted,
      counters.duration_ms
    );
    return res.status(200).json(counters);
  } catch (err) {
    logger.error('[cron/dispute-sla] handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
