// pages/api/caster/heartbeat.ts
//
// Feature: Run-of-show — Lot 5 (cues + presence).
// POST : heartbeat cockpit. UPSERT sur caster_presence (PK cast_member_id).
//
// Body : { event_run_id?: string | null }
//   - null/undefined si le caster est sur le cockpit sans run live.
//   - sinon : le run doit appartenir au tenant et etre status='live' (400 sinon
//     pour eviter la pollution).
//
// Auth : withCasterRoute.
// Rate limit : 10/min (heartbeat 20s = 3/min, marge confortable pour retries).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { logger } from '@/utils/logger';

const HeartbeatSchema = z.object({
  event_run_id: z.string().uuid().nullable().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'caster-heartbeat')
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const parsed = HeartbeatSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const eventRunId = parsed.data.event_run_id ?? null;

  // Si event_run_id fourni : valide tenant + status='live'.
  if (eventRunId) {
    const { data: run, error: runErr } = await admin
      .from('event_runs')
      .select('id, status')
      .eq('id', eventRunId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (runErr) {
      logger.error('[caster/heartbeat] run lookup error', runErr);
      return res.status(500).json({ error: 'Failed to load event run.' });
    }
    if (!run) {
      return res.status(400).json({
        error: "L'event_run_id fourni n'existe pas ou n'appartient pas a ce tenant.",
        code: 'RUN_NOT_FOUND',
      });
    }
    if (run.status !== 'live') {
      return res.status(400).json({
        error: `Le run cible est status='${run.status}'. Le heartbeat doit cibler un run live (ou null).`,
        code: 'RUN_NOT_LIVE',
      });
    }
  }

  const userAgentRaw = req.headers['user-agent'];
  const userAgent =
    typeof userAgentRaw === 'string' ? userAgentRaw.slice(0, 500) : null;

  const nowIso = new Date().toISOString();

  const { error: upErr } = await admin
    .from('caster_presence')
    .upsert(
      {
        cast_member_id: ctx.caster.id,
        tenant_id: ctx.tenantId,
        event_run_id: eventRunId,
        last_seen_at: nowIso,
        user_agent: userAgent,
      },
      { onConflict: 'cast_member_id' }
    );

  if (upErr) {
    logger.error('[caster/heartbeat] upsert error', upErr);
    return res.status(500).json({ error: 'Failed to record heartbeat.' });
  }

  // Construit la response a partir des valeurs envoyees : la trigger
  // updated_at cote DB n'est pas exposee au client (le hook cockpit ne la
  // lit pas), et eviter le .select().single() apres upsert garde le contrat
  // simple + testable.
  return res.status(200).json({
    presence: {
      cast_member_id: ctx.caster.id,
      event_run_id: eventRunId,
      last_seen_at: nowIso,
      user_agent: userAgent,
    },
  });
}

export default withCasterRoute(handler);
