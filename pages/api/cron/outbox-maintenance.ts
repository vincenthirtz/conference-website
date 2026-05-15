// pages/api/cron/outbox-maintenance.ts
//
// Maintenance horaire de la table bot_event_outbox. Trois roles :
//
//   1. Cleanup : supprime les rows 'delivered' / 'failed' plus vieux que
//      OUTBOX_DELETE_AFTER_DAYS (defaut 7). Sans ca, la table croit sans
//      limite (le emitBotEvent / l'ack ne purgent rien).
//
//   2. Poison-pill : passe les rows 'pending' plus vieux que
//      OUTBOX_FAILED_AFTER_HOURS (defaut 6) en status='failed'. Empeche un
//      event corrompu (le bot crashe en dispatch) de rester pending eternellement
//      et d'etre re-tente a chaque tick du poller. Operateur peut inspecter
//      last_push_error puis re-emit manuellement si besoin.
//
//   3. Observabilite : renvoie un snapshot des compteurs et de la latence
//      de livraison (p50/p95 sur les dernieres 24h). Logge en structure pour
//      etre grepable dans les logs Netlify ; le wrapper Netlify scheduled
//      function logge la reponse a chaque tick.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). Meme pattern que
// /api/cron/checkin-process et /api/cron/broadcast-process.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

const DEFAULT_FAILED_AFTER_HOURS = 6;
const DEFAULT_DELETE_AFTER_DAYS = 7;
const LATENCY_SAMPLE_CAP = 10_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/outbox-maintenance] CRON_SECRET not configured — refusing');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  // Interpolation lineaire entre les deux voisins (equivalent
  // percentile_cont de PostgreSQL).
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const failedAfterHours = envNumber(
    'OUTBOX_FAILED_AFTER_HOURS',
    DEFAULT_FAILED_AFTER_HOURS
  );
  const deleteAfterDays = envNumber(
    'OUTBOX_DELETE_AFTER_DAYS',
    DEFAULT_DELETE_AFTER_DAYS
  );

  const now = Date.now();
  const failedCutoffIso = new Date(
    now - failedAfterHours * 3_600_000
  ).toISOString();
  const deleteCutoffIso = new Date(
    now - deleteAfterDays * 86_400_000
  ).toISOString();
  const since24hIso = new Date(now - 24 * 3_600_000).toISOString();

  // 1. Poison-pill : pending trop vieux -> failed. select() pour pouvoir
  // logger chaque event marque (utile pour identifier des patterns de panne).
  const { data: markedRows, error: markErr } = await supabaseAdmin
    .from('bot_event_outbox')
    .update({
      status: 'failed',
      last_push_at: new Date(now).toISOString(),
      last_push_error: `auto-failed: pending > ${failedAfterHours}h`,
    })
    .eq('status', 'pending')
    .lt('created_at', failedCutoffIso)
    .select('id, event_id, event_name, created_at, push_attempts');

  if (markErr) {
    logger.error('[cron/outbox-maintenance] mark-failed error', markErr);
    return res.status(500).json({ error: 'mark-failed failed' });
  }

  const markedCount = markedRows?.length ?? 0;
  for (const row of markedRows ?? []) {
    const r = row as {
      id: number;
      event_id: string;
      event_name: string;
      created_at: string;
      push_attempts: number;
    };
    const ageMin = Math.round(
      (now - new Date(r.created_at).getTime()) / 60_000
    );
    logger.warn(
      '[cron/outbox-maintenance] poison-pill marked failed: id=%d event=%s eventId=%s ageMin=%d pushAttempts=%d',
      r.id,
      r.event_name,
      r.event_id,
      ageMin,
      r.push_attempts
    );
  }

  // 2. Cleanup : delete delivered/failed plus vieux que cutoff. select('id')
  // permet de compter sans race.
  const { data: deletedRows, error: delErr } = await supabaseAdmin
    .from('bot_event_outbox')
    .delete()
    .in('status', ['delivered', 'failed'])
    .lt('created_at', deleteCutoffIso)
    .select('id');

  if (delErr) {
    logger.error('[cron/outbox-maintenance] delete-old error', delErr);
    return res.status(500).json({ error: 'cleanup failed' });
  }
  const deletedCount = deletedRows?.length ?? 0;

  // 3. Stats — comptes globaux + latence p50/p95 sur 24h.
  // Requetes paralleles pour minimiser la latence du cron.
  const [
    pendingCountRes,
    oldestPendingRes,
    delivered24hCountRes,
    failed24hCountRes,
    deliveredSampleRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('bot_event_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('bot_event_outbox')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('bot_event_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'delivered')
      .gte('delivered_at', since24hIso),
    supabaseAdmin
      .from('bot_event_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('last_push_at', since24hIso),
    supabaseAdmin
      .from('bot_event_outbox')
      .select('created_at, delivered_at')
      .eq('status', 'delivered')
      .gte('delivered_at', since24hIso)
      .limit(LATENCY_SAMPLE_CAP),
  ]);

  const pendingCount = pendingCountRes.count ?? 0;
  const oldestPendingAt =
    (oldestPendingRes.data as { created_at?: string } | null)?.created_at ??
    null;
  const oldestPendingAgeSec = oldestPendingAt
    ? Math.round((now - new Date(oldestPendingAt).getTime()) / 1000)
    : null;
  const delivered24h = delivered24hCountRes.count ?? 0;
  const failed24h = failed24hCountRes.count ?? 0;

  const latenciesMs: number[] = [];
  for (const row of (deliveredSampleRes.data ?? []) as Array<{
    created_at: string;
    delivered_at: string | null;
  }>) {
    if (!row.delivered_at) continue;
    const ms =
      new Date(row.delivered_at).getTime() - new Date(row.created_at).getTime();
    if (ms >= 0) latenciesMs.push(ms);
  }
  latenciesMs.sort((a, b) => a - b);
  const p50Ms = percentile(latenciesMs, 0.5);
  const p95Ms = percentile(latenciesMs, 0.95);
  const p99Ms = percentile(latenciesMs, 0.99);
  const maxMs = latenciesMs.length > 0 ? latenciesMs[latenciesMs.length - 1] : null;

  const stats = {
    pendingCount,
    oldestPendingAgeSec,
    delivered24h,
    failed24h,
    latencyMs: {
      sampleSize: latenciesMs.length,
      sampleCap: LATENCY_SAMPLE_CAP,
      p50: p50Ms,
      p95: p95Ms,
      p99: p99Ms,
      max: maxMs,
    },
  };

  logger.info(
    '[cron/outbox-maintenance] done: markedFailed=%d deleted=%d pending=%d ' +
      'oldestPendingAgeSec=%s delivered24h=%d failed24h=%d ' +
      'latency24hMs p50=%s p95=%s p99=%s max=%s sample=%d',
    markedCount,
    deletedCount,
    pendingCount,
    oldestPendingAgeSec ?? 'n/a',
    delivered24h,
    failed24h,
    p50Ms !== null ? Math.round(p50Ms) : 'n/a',
    p95Ms !== null ? Math.round(p95Ms) : 'n/a',
    p99Ms !== null ? Math.round(p99Ms) : 'n/a',
    maxMs !== null ? Math.round(maxMs) : 'n/a',
    latenciesMs.length
  );

  return res.status(200).json({
    success: true,
    config: {
      failedAfterHours,
      deleteAfterDays,
    },
    markedFailed: markedCount,
    deleted: deletedCount,
    stats,
  });
}
