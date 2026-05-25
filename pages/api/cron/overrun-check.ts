// pages/api/cron/overrun-check.ts
//
// Feature: Run-of-show — Lot 6 (timing/drift), server-side fallback de
// l'escalation overrun.
//
// Trigger : Netlify Scheduled Function `overrun-watcher-cron` toutes les
// 2 minutes (cf. netlify.toml). En production le hook client
// `useOverrunWatcher` (executé dans l'onglet /admin/events/[runId]/director
// quand il est ouvert) gere l'escalation T+0 / T+2min / T+5min. Si l'onglet
// est ferme, plus personne ne tire le T+5min → ce cron prend le relais.
// Latence : cue cree entre T+5min et T+7min selon le tick.
//
// Auth : Bearer CRON_SECRET (header Authorization). Pas de session
// utilisateur, pas de tenant — on opere `supabaseAdmin` (service_role) en
// mode CROSS-TENANT pour traiter tous les runs `status='live'` de la
// plateforme en un seul scan.
//
// Idempotence :
//   - Chaque tentative d'insert utilise `dedup_key = auto-overrun:{runId}:{segId}`,
//     identique a celle utilisee par le client. Un partial UNIQUE INDEX
//     cote DB (uq_event_cues_dedup_key) garantit qu'au plus un cue existe
//     par clef.
//   - Conflict 23505 = quelqu'un d'autre (client OU tick precedent) a deja
//     ecrit → on skip silencieusement et on incremente le compteur `deduped`.
//   - Resultat : ce cron peut tourner toutes les 2min sans risque de
//     duplication, meme apres un cue manuel du client.
//
// Time budget :
//   - 20s soft cap interne. La boucle break si on depasse. Le reste sera
//     traite au prochain tick (2min plus tard). Netlify scheduled functions
//     tolerent jusqu'a 30s — on garde 10s de marge.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

const AUTO_CUE_THRESHOLD_SEC = 300; // T+5min — aligne sur useOverrunWatcher.ts
const SOFT_TIME_BUDGET_MS = 20_000;

type RunRow = {
  id: string;
  tenant_id: string;
};

type SegmentRow = {
  id: string;
  event_run_id: string;
  tenant_id: string;
  title: string;
  duration_min: number | null;
  started_at: string | null;
  status: string;
};

type TickCounters = {
  runs_examined: number;
  segments_examined: number;
  escalated: number;
  deduped: number;
  errors: number;
  truncated_by_time_budget: boolean;
  duration_ms: number;
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/overrun-check] CRON_SECRET not configured — refusing');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  // Fallback query param (used by manual curl during ops debugging).
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    return code === '23505';
  }
  return false;
}

/**
 * Lit tous les event_runs en status='live'. Cross-tenant — on ne filtre PAS
 * par tenant_id ici (c'est tout l'interet du cron).
 */
async function loadLiveRuns(): Promise<RunRow[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('event_runs')
    .select('id, tenant_id')
    .eq('status', 'live');
  if (error) {
    logger.error('[cron/overrun-check] load runs error', error);
    return [];
  }
  return (data ?? []) as RunRow[];
}

/**
 * Lit les segments live d'un run, avec started_at et duration_min non-NULL
 * (sans ces deux champs, on ne peut pas calculer l'overrun).
 */
async function loadLiveSegmentsForRun(runId: string): Promise<SegmentRow[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('event_segments')
    .select('id, event_run_id, tenant_id, title, duration_min, started_at, status')
    .eq('event_run_id', runId)
    .eq('status', 'live')
    .not('started_at', 'is', null)
    .not('duration_min', 'is', null);
  if (error) {
    logger.error('[cron/overrun-check] load segments error', error);
    return [];
  }
  return (data ?? []) as SegmentRow[];
}

/**
 * Tente d'inserer un cue 'urgent' dedup. Conflict 23505 = deja cree, on
 * retourne 'deduped'. Toute autre erreur = 'error'.
 */
async function tryInsertOverrunCue(params: {
  runId: string;
  tenantId: string;
  segment: SegmentRow;
}): Promise<'escalated' | 'deduped' | 'error'> {
  if (!supabaseAdmin) return 'error';
  const { runId, tenantId, segment } = params;
  const dedupKey = `auto-overrun:${runId}:${segment.id}`;
  // Body aligne sur le wording client (useOverrunWatcher) pour qu'un cue
  // soit textuellement identique qu'il vienne du browser ou du cron.
  const body = `OVERRUN: "${segment.title}" en depassement de 5min — cloturer ou prolonger ?`;

  const { error } = await supabaseAdmin.from('event_cues').insert({
    tenant_id: tenantId,
    event_run_id: runId,
    severity: 'urgent',
    body,
    created_by_user_id: null, // origine = cron, pas un humain
    dedup_key: dedupKey,
  });

  if (!error) return 'escalated';
  if (isUniqueViolation(error)) return 'deduped';
  logger.error(
    '[cron/overrun-check] insert cue error run=%s seg=%s:',
    runId,
    segment.id,
    error
  );
  return 'error';
}

export async function runOverrunCheck(): Promise<TickCounters> {
  const startedAt = Date.now();
  const counters: TickCounters = {
    runs_examined: 0,
    segments_examined: 0,
    escalated: 0,
    deduped: 0,
    errors: 0,
    truncated_by_time_budget: false,
    duration_ms: 0,
  };

  const runs = await loadLiveRuns();
  counters.runs_examined = runs.length;
  if (runs.length === 0) {
    counters.duration_ms = Date.now() - startedAt;
    return counters;
  }

  const nowMs = Date.now();

  for (const run of runs) {
    if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) {
      counters.truncated_by_time_budget = true;
      break;
    }

    const segments = await loadLiveSegmentsForRun(run.id);
    for (const seg of segments) {
      counters.segments_examined += 1;
      // started_at filtered NOT NULL en SQL, mais on guard pour TS.
      if (!seg.started_at || seg.duration_min == null) continue;
      const startedMs = Date.parse(seg.started_at);
      if (!Number.isFinite(startedMs)) continue;

      const plannedEndMs = startedMs + seg.duration_min * 60_000;
      const overrunSec = (nowMs - plannedEndMs) / 1000;
      if (overrunSec < AUTO_CUE_THRESHOLD_SEC) continue;

      const result = await tryInsertOverrunCue({
        runId: run.id,
        tenantId: seg.tenant_id,
        segment: seg,
      });
      if (result === 'escalated') counters.escalated += 1;
      else if (result === 'deduped') counters.deduped += 1;
      else counters.errors += 1;
    }
  }

  counters.duration_ms = Date.now() - startedAt;
  return counters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  try {
    const counters = await runOverrunCheck();
    logger.info(
      '[cron/overrun-check] tick done runs=%d segs=%d escalated=%d ' +
        'deduped=%d errors=%d duration_ms=%d truncated=%s',
      counters.runs_examined,
      counters.segments_examined,
      counters.escalated,
      counters.deduped,
      counters.errors,
      counters.duration_ms,
      counters.truncated_by_time_budget ? 'yes' : 'no'
    );
    return res.status(200).json({ success: true, ...counters });
  } catch (err) {
    logger.error('[cron/overrun-check] unexpected error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: String(err) });
  }
}
