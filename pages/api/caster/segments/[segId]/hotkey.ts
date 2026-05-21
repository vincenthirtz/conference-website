// pages/api/caster/segments/[segId]/hotkey.ts
//
// Feature: Run-of-show — Lot 4.
// POST : declenche une hotkey du Caster Cockpit (Highlight / Score / Pause).
//
// Auth : withCasterRoute (staff role >= caster + cast_members link actif).
//
// Body : { kind: 'highlight' | 'score' | 'pause', payload?: object }
//
// Ownership : pour eviter qu un caster du tenant X declenche une hotkey sur
// un segment du tenant Y :
//   - le segment doit appartenir au tenant_id du caster.
//   - si le segment est de type 'match', on verifie aussi que le caster est
//     bien assigne au match correspondant (cast_assignments). Pour les autres
//     types (intro/outro/break/custom), tout caster du tenant peut.
//
// Effet : ecriture d un event 'cast.hotkey_triggered' dans bot_event_outbox.
// Le bot consommera cet event au Lot 5 (DM / annonce Discord, signal RTMP,
// etc). Pour la V1 backend on se contente de tracer le signal — l UX cote
// caster est immediat via le toast.
//
// Idempotency-Key : supporte via X-Idempotency-Key header. Si presente, on
// log/skip les re-emissions (le client useIdempotentMutation regenere une
// cle apres succes ; ce header est plutot un anti-double-click).
// Pour la V1 on ecrit toujours dans l outbox (pas de table dedup serveur)
// mais on inclut la cle dans le payload pour permettre le dedup downstream.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const Schema = z.object({
  kind: z.enum(['highlight', 'score', 'pause']),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const EVENT_NAME = 'cast.hotkey_triggered';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'caster-hotkey')
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const { segId } = req.query;
  if (!segId || Array.isArray(segId) || !isValidUUID(segId)) {
    return res.status(400).json({ error: 'Invalid segId.' });
  }

  const parsed = Schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { kind, payload } = parsed.data;

  // 1) Charge le segment ; verifie qu il appartient au tenant du caster.
  const { data: segment, error: segErr } = await admin
    .from('event_segments')
    .select('id, tenant_id, event_run_id, type, match_id, title')
    .eq('id', segId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (segErr) {
    logger.error('[caster/hotkey] segment lookup error', segErr);
    return res.status(500).json({ error: 'Failed to load segment.' });
  }
  if (!segment) {
    return res.status(404).json({ error: 'Segment not found.' });
  }

  // 2) Si segment de type 'match' lie a un match, on verifie l assignation
  //    cast_assignments. Sinon (intro/outro/break/custom), tout caster du
  //    tenant peut declencher la hotkey.
  if (segment.type === 'match' && segment.match_id) {
    const { data: assignment, error: assignErr } = await admin
      .from('cast_assignments')
      .select('id')
      .eq('match_id', segment.match_id)
      .eq('cast_member_id', ctx.caster.id)
      .eq('tenant_id', ctx.tenantId)
      .limit(1)
      .maybeSingle();
    if (assignErr) {
      logger.error('[caster/hotkey] assignment lookup error', assignErr);
      return res.status(500).json({ error: 'Failed to load assignment.' });
    }
    if (!assignment) {
      return res.status(403).json({
        error: 'Tu n es pas assigne au match de ce segment.',
        code: 'NOT_ASSIGNED',
      });
    }
  }

  // 3) Construit le payload outbox.
  const idempotencyKey =
    typeof req.headers['idempotency-key'] === 'string'
      ? req.headers['idempotency-key']
      : null;

  const eventId = crypto.randomUUID();
  const outboxPayload = {
    id: eventId,
    event: EVENT_NAME,
    tenantId: ctx.tenantId,
    timestamp: new Date().toISOString(),
    data: {
      segmentId: segment.id,
      runId: segment.event_run_id,
      matchId: segment.match_id,
      segmentType: segment.type,
      segmentTitle: segment.title,
      kind,
      payload: payload ?? null,
      caster: {
        id: ctx.caster.id,
        name: ctx.caster.name,
      },
      idempotencyKey,
    },
  };

  const { error: insErr } = await admin.from('bot_event_outbox').insert({
    event_id: eventId,
    event_name: EVENT_NAME,
    tenant_id: ctx.tenantId,
    payload: outboxPayload,
    status: 'pending',
  });

  if (insErr) {
    logger.error('[caster/hotkey] outbox insert error', insErr);
    return res.status(500).json({ error: 'Failed to record hotkey.' });
  }

  return res.status(202).json({
    ok: true,
    eventId,
    kind,
  });
}

export default withCasterRoute(handler);
