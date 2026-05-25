// utils/disputes/slaBreaches.ts
//
// Pure-ish helpers to detect dispute SLA breaches and mark them as escalated.
// Consumed by :
//   - /api/cron/dispute-sla-check       (fires `dispute.sla_breached` event)
//   - /api/bot/v1/disputes/escalations  (bot pull endpoint)
//   - /api/admin/disputes               (admin board)
//
// SLA semantics : a match in `status='disputed'` whose
// `now - dispute_opened_at >= tenant.dispute_sla_minutes` AND
// `escalation_pinged_at IS NULL` is considered "breached" — it has been
// open long enough to warrant a staff DM and hasn't been pinged yet.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export type DisputeBreach = {
  matchId: string;
  tournamentId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  disputeReason: string | null;
  disputeOpenedAt: string;
  ageMinutes: number;
  slaMinutes: number;
};

export type SLAClassification = 'breached' | 'approaching' | 'fresh';

export type DisputeRow = {
  matchId: string;
  tournamentId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  disputeReason: string | null;
  disputeOpenedAt: string | null;
  escalationPingedAt: string | null;
  ageMinutes: number | null;
  slaMinutes: number;
  classification: SLAClassification;
};

/**
 * Classify an open dispute relative to the tenant's SLA.
 *
 * - `breached`   : age >= SLA
 * - `approaching`: age >= 0.75 * SLA (last quarter of the window)
 * - `fresh`      : everything else (including unknown age)
 */
export function classifyAge(
  ageMinutes: number | null,
  slaMinutes: number
): SLAClassification {
  if (ageMinutes === null || !Number.isFinite(ageMinutes)) return 'fresh';
  if (ageMinutes >= slaMinutes) return 'breached';
  if (ageMinutes >= slaMinutes * 0.75) return 'approaching';
  return 'fresh';
}

export function ageInMinutes(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / 60_000);
}

/**
 * Returns every `disputed` match in the tenant, with age + classification.
 * No `escalation_pinged_at IS NULL` filter — the bot endpoint wants to
 * show already-pinged disputes too (as "pingé X min ago").
 */
export async function listOpenDisputes(
  tenantId: string,
  opts: { tournamentId?: string | null; nowMs?: number } = {}
): Promise<DisputeRow[]> {
  if (!supabaseAdmin) return [];
  const nowMs = opts.nowMs ?? Date.now();

  const slaMinutes = await getSlaMinutes(tenantId);

  let query = supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, team1_id, team2_id, dispute_reason, dispute_opened_at, escalation_pinged_at'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'disputed')
    .order('dispute_opened_at', { ascending: true });

  if (opts.tournamentId) {
    query = query.eq('tournament_id', opts.tournamentId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[disputes/slaBreaches] listOpenDisputes error', error);
    return [];
  }

  return (data ?? []).map((m: any) => {
    const ageMinutes = ageInMinutes(m.dispute_opened_at, nowMs);
    return {
      matchId: m.id,
      tournamentId: m.tournament_id ?? null,
      team1Id: m.team1_id ?? null,
      team2Id: m.team2_id ?? null,
      disputeReason: m.dispute_reason ?? null,
      disputeOpenedAt: m.dispute_opened_at ?? null,
      escalationPingedAt: m.escalation_pinged_at ?? null,
      ageMinutes,
      slaMinutes,
      classification: classifyAge(ageMinutes, slaMinutes),
    };
  });
}

/**
 * Subset of `listOpenDisputes` filtered to breaches that haven't been
 * pinged yet — the rows the cron will emit `dispute.sla_breached` for.
 */
export async function findUnpingedBreaches(
  tenantId: string,
  nowMs: number = Date.now()
): Promise<DisputeBreach[]> {
  const slaMinutes = await getSlaMinutes(tenantId);
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, team1_id, team2_id, dispute_reason, dispute_opened_at, escalation_pinged_at'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'disputed')
    .is('escalation_pinged_at', null);

  if (error) {
    logger.error('[disputes/slaBreaches] findUnpingedBreaches error', error);
    return [];
  }

  const out: DisputeBreach[] = [];
  for (const m of (data ?? []) as any[]) {
    const age = ageInMinutes(m.dispute_opened_at, nowMs);
    if (age === null || age < slaMinutes) continue;
    if (!m.dispute_opened_at) continue;
    out.push({
      matchId: m.id,
      tournamentId: m.tournament_id ?? null,
      team1Id: m.team1_id ?? null,
      team2Id: m.team2_id ?? null,
      disputeReason: m.dispute_reason ?? null,
      disputeOpenedAt: m.dispute_opened_at,
      ageMinutes: age,
      slaMinutes,
    });
  }
  return out;
}

/**
 * Set `escalation_pinged_at = now()` on a batch of match IDs. Called after
 * the outbox event has been written, so a crash between insert and update
 * just means the next cron tick re-fires the event (idempotent at the bot
 * side via outbox `event_id` UUID).
 */
export async function markEscalationPinged(
  tenantId: string,
  matchIds: string[],
  nowIso: string = new Date().toISOString()
): Promise<void> {
  if (!supabaseAdmin || matchIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from('matches')
    .update({ escalation_pinged_at: nowIso })
    .eq('tenant_id', tenantId)
    .in('id', matchIds)
    .is('escalation_pinged_at', null);
  if (error) {
    logger.error('[disputes/slaBreaches] markEscalationPinged error', error);
  }
}

/**
 * Look up `dispute_sla_minutes` for the tenant. Falls back to 60 (DB
 * default) if the column is somehow missing — defensive, the migration
 * makes it NOT NULL DEFAULT 60 so this fallback is only for unit tests
 * that don't seed `tenants`.
 */
export async function getSlaMinutes(tenantId: string): Promise<number> {
  if (!supabaseAdmin) return 60;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('dispute_sla_minutes')
    .eq('id', tenantId)
    .maybeSingle();
  const v = (data as any)?.dispute_sla_minutes;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return v;
  return 60;
}
