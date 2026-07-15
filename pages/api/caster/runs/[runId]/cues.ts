// pages/api/caster/runs/[runId]/cues.ts
//
// Feature: Run-of-show — Lot 5 (cues + presence).
// GET : cues du run pour le cockpit caster (polling toutes les 3s).
//
// Auth : withCasterRoute.
//
// Validation :
//   - runId appartient au tenant du caster.
//   - status='live' (les casters ne pollent pas les runs draft/done).
//
// Query :
//   - ?since=<ISO timestamp> : ne renvoie que les cues created_at > since.
//   - ?limit=20 (max 100).
//
// Response : { cues: Array<{ ...EventCue, acked_by_me: boolean }> }
//   - acked_by_me = il existe un row event_cue_acks (cue.id, ctx.caster.id).
//
// Cache-Control : private, no-store (cockpit-only, polling).
// Rate limit : 60/min (3s polling = ~20 req/min, marge x3).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import type { EventCue } from '@/types/events';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-cue-poll')
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  // Limit : default 20, max 100.
  const rawLimit = req.query.limit;
  const limitRaw = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  const parsedLimit = parseInt(limitRaw ?? '20', 10);
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 20)
  );

  // ?since : timestamp ISO. On valide via Date.parse.
  const rawSince = req.query.since;
  const sinceRaw = Array.isArray(rawSince) ? rawSince[0] : rawSince;
  let sinceIso: string | null = null;
  if (typeof sinceRaw === 'string' && sinceRaw.trim().length > 0) {
    const ts = Date.parse(sinceRaw);
    if (!Number.isFinite(ts)) {
      return res.status(400).json({
        error: 'Invalid `since` query param (must be ISO timestamp).',
        code: 'INVALID_SINCE',
      });
    }
    sinceIso = new Date(ts).toISOString();
  }

  // Verifie ownership + status live.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, status')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[caster/runs/cues] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }
  if (run.status !== 'live') {
    return res.status(409).json({
      error: `Le run est status='${run.status}'. Pas de polling cue hors live.`,
      code: 'RUN_NOT_LIVE',
    });
  }

  let cuesQuery = admin
    .from('event_cues')
    .select(
      'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key, retracted_at, retracted_by_user_id'
    )
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sinceIso) {
    cuesQuery = cuesQuery.gt('created_at', sinceIso);
  }

  const { data: cues, error: cuesErr } = await cuesQuery;
  if (cuesErr) {
    logger.error('[caster/runs/cues] cues error', cuesErr);
    return res.status(500).json({ error: 'Failed to load cues.' });
  }

  // Type = EventCue canonique (types/events.ts), pas de re-declaration locale.
  // Le SELECT ci-dessus reprend exactement ses colonnes → enriched = CueWithAck
  // (EventCue & { acked_by_me }) cote client, sans divergence a maintenir.
  const rows: EventCue[] = (cues as EventCue[] | null) ?? [];

  // acked_by_me : fetch acks pour les cues retournes, filtres sur ctx.caster.id.
  let myAckSet = new Set<string>();
  if (rows.length > 0) {
    const cueIds = rows.map((r) => r.id);
    const { data: myAcks, error: ackErr } = await admin
      .from('event_cue_acks')
      .select('cue_id')
      .eq('cast_member_id', ctx.caster.id)
      .eq('tenant_id', ctx.tenantId)
      .in('cue_id', cueIds);

    if (ackErr) {
      logger.error('[caster/runs/cues] acks error', ackErr);
      return res.status(500).json({ error: 'Failed to load ack state.' });
    }

    myAckSet = new Set(
      ((myAcks as { cue_id: string }[] | null) ?? []).map((a) => a.cue_id)
    );
  }

  const enriched = rows.map((c) => ({
    ...c,
    acked_by_me: myAckSet.has(c.id),
  }));

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ cues: enriched });
}

export default withCasterRoute(handler);
