// pages/api/caster/cues/[cueId]/ack.ts
//
// Feature: Run-of-show — Lot 5 (cues + presence).
// POST : un caster ack un cue (typiquement un cue 'urgent').
//
// Auth : withCasterRoute (staff role >= caster + cast_members link actif).
//
// Validation :
//   - Cue existe ET appartient au tenant du caster.
//   - L'event_run associe au cue doit etre status='live'. Sinon 409.
//
// Idempotence : PK composite (cue_id, cast_member_id) cote DB → INSERT ON
// CONFLICT DO NOTHING. On retourne 200 meme si deja acke (`alreadyAcked: true`).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-cue-ack')
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

  const { cueId } = req.query;
  if (!cueId || Array.isArray(cueId) || !isValidUUID(cueId)) {
    return res.status(400).json({ error: 'Invalid cueId.' });
  }

  // 1) Charge le cue + verifie tenant ownership.
  const { data: cue, error: cueErr } = await admin
    .from('event_cues')
    .select('id, tenant_id, event_run_id, severity')
    .eq('id', cueId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (cueErr) {
    logger.error('[caster/cues/ack] cue lookup error', cueErr);
    return res.status(500).json({ error: 'Failed to load cue.' });
  }
  if (!cue) {
    return res.status(404).json({ error: 'Cue not found.' });
  }

  // 2) Le run associe doit etre LIVE.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, status')
    .eq('id', cue.event_run_id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[caster/cues/ack] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }
  if (run.status !== 'live') {
    return res.status(409).json({
      error: `Impossible d'acquitter un cue d'un run status='${run.status}'.`,
      code: 'RUN_NOT_LIVE',
    });
  }

  // 3) Check existant pour determiner alreadyAcked AVANT l'upsert.
  //    (ON CONFLICT DO NOTHING ne retourne rien en cas de conflit, ce qui rend
  //    la distinction inserted vs already-acked plus delicate via .select().)
  const { data: existing, error: existErr } = await admin
    .from('event_cue_acks')
    .select('cue_id, cast_member_id, acked_at')
    .eq('cue_id', cueId)
    .eq('cast_member_id', ctx.caster.id)
    .maybeSingle();

  if (existErr) {
    logger.error('[caster/cues/ack] existing lookup error', existErr);
    return res.status(500).json({ error: 'Failed to load existing ack.' });
  }

  if (existing) {
    return res.status(200).json({
      ack: {
        cue_id: existing.cue_id,
        cast_member_id: existing.cast_member_id,
        acked_at: existing.acked_at,
      },
      alreadyAcked: true,
    });
  }

  // 4) Insert. PK composite garantit l'unicite ; on accepte le 23505 silencieux
  //    en repassant par un re-fetch (race entre check et insert).
  const { data: inserted, error: insErr } = await admin
    .from('event_cue_acks')
    .insert({
      cue_id: cueId,
      cast_member_id: ctx.caster.id,
      tenant_id: ctx.tenantId,
    })
    .select('cue_id, cast_member_id, acked_at')
    .maybeSingle();

  if (insErr) {
    // 23505 = unique violation : race with parallel ack. On refetch.
    const code = (insErr as { code?: string }).code;
    if (code === '23505') {
      const { data: refetched } = await admin
        .from('event_cue_acks')
        .select('cue_id, cast_member_id, acked_at')
        .eq('cue_id', cueId)
        .eq('cast_member_id', ctx.caster.id)
        .maybeSingle();
      if (refetched) {
        return res.status(200).json({
          ack: refetched,
          alreadyAcked: true,
        });
      }
    }
    logger.error('[caster/cues/ack] insert error', insErr);
    return res.status(500).json({ error: 'Failed to record ack.' });
  }

  if (!inserted) {
    return res.status(500).json({ error: 'Failed to record ack.' });
  }

  return res.status(200).json({
    ack: inserted,
    alreadyAcked: false,
  });
}

export default withCasterRoute(handler);
