// pages/api/caster/runs/current.ts
//
// Feature: Run-of-show — Lot 2.
// GET : event_run courant du tenant du caster (status='live') + tous ses
// segments tries par ord. Le caster voit tout — broadcast_message et
// caster_checklist inclus (contrairement a l'endpoint public).
//
// Si aucun run live → 200 avec run=null (l'UI cockpit affichera un placeholder
// "pas d'event en cours").

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'caster-run-current'
    )
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

  // Idealement il n'y a qu'un seul run live a la fois par tenant — mais on
  // n'a pas de contrainte DB pour le garantir, donc on prend le plus recent.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select(
      'id, name, slug, description, scheduled_at, status, started_at, ended_at, created_at, updated_at'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'live')
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (runErr) {
    logger.error('[caster/runs/current] run error', runErr);
    return res.status(500).json({ error: 'Failed to load current run.' });
  }

  if (!run) {
    return res.status(200).json({ run: null, segments: [] });
  }

  const { data: segments, error: segErr } = await admin
    .from('event_segments')
    .select(
      'id, ord, type, match_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .eq('event_run_id', run.id)
    .eq('tenant_id', ctx.tenantId)
    .order('ord', { ascending: true });

  if (segErr) {
    logger.error('[caster/runs/current] segments error', segErr);
    return res.status(500).json({ error: 'Failed to load segments.' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    run,
    segments: segments ?? [],
  });
}

export default withCasterRoute(handler);
