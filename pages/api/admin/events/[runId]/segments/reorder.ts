// pages/api/admin/events/[runId]/segments/reorder.ts
//
// Feature: Run-of-show — Lot 2.
// POST : reorder segments d'un event_run. Body `{ orderedIds: uuid[] }`.
//
// Strategie de reordonnancement :
//   La contrainte UNIQUE (event_run_id, ord) est DEFERRABLE INITIALLY
//   IMMEDIATE en DB, mais supabase-js n'expose pas les transactions, donc
//   `SET CONSTRAINTS DEFERRED` n'est pas accessible. On utilise a la place
//   la technique du "decalage temporaire" :
//
//     Phase 1 — On set ord = ord + 1_000_000 sur tous les segments
//               concernes. Les nouveaux ord (~1M) ne risquent pas de
//               collisionner avec les ord cibles (0..N).
//     Phase 2 — On set ord = <index final> dans l'ordre passe par le client.
//
//   Cette technique est robuste : meme si l'API plante entre phase 1 et 2,
//   les segments restent dans le run (ord toujours unique, juste decales).
//   Un /reorder ulterieur les remettra droit.
//
// Validation :
//   - orderedIds doit contenir EXACTEMENT tous les segments du run, une fois
//     chacun. Si manquant ou en trop → 400.
//
// Idempotent : oui (Idempotency-Key header honore via withAdminIdempotency).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const REORDER_OFFSET = 1_000_000;

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-events-reorder'
    )
  )
    return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  const parsed = ReorderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { orderedIds } = parsed.data;

  // Verifier le run.
  const { data: run } = await admin
    .from('event_runs')
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  // Recuperer tous les segments du run + tenant scope (defense en profondeur).
  const { data: existing, error: fetchErr } = await admin
    .from('event_segments')
    .select('id')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId);

  if (fetchErr) {
    logger.error('[admin/events/reorder] fetch error', fetchErr);
    return res.status(500).json({ error: 'Failed to load segments.' });
  }

  const existingIds = new Set((existing ?? []).map((s) => s.id as string));
  const requestedIds = new Set(orderedIds);

  // Doublons interdits.
  if (requestedIds.size !== orderedIds.length) {
    return res.status(400).json({
      error: 'orderedIds contient des doublons.',
      code: 'DUPLICATE_IDS',
    });
  }
  // Tous les ids doivent appartenir au run.
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return res.status(400).json({
        error: `Le segment ${id} n'appartient pas a ce run.`,
        code: 'SEGMENT_NOT_IN_RUN',
        segmentId: id,
      });
    }
  }
  // Pas de segment manquant non plus.
  if (requestedIds.size !== existingIds.size) {
    return res.status(400).json({
      error:
        'orderedIds doit contenir tous les segments du run (aucun manquant, aucun en trop).',
      code: 'INCOMPLETE_REORDER',
      expected: existingIds.size,
      received: requestedIds.size,
    });
  }

  // Phase 1 : decaler tous les segments vers REORDER_OFFSET + i pour eviter
  // les collisions avec les ord cibles 0..N-1.
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const { error: shiftErr } = await admin
      .from('event_segments')
      .update({ ord: REORDER_OFFSET + i })
      .eq('id', id)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);
    if (shiftErr) {
      logger.error('[admin/events/reorder] phase 1 error', shiftErr);
      return res.status(500).json({
        error: 'Failed to reorder segments (phase 1).',
        code: 'REORDER_PHASE1_FAILED',
      });
    }
  }

  // Phase 2 : ecrire les ord finaux (0..N-1) dans l'ordre du client.
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const { error: setErr } = await admin
      .from('event_segments')
      .update({ ord: i })
      .eq('id', id)
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId);
    if (setErr) {
      logger.error('[admin/events/reorder] phase 2 error', setErr);
      return res.status(500).json({
        error:
          'Failed to reorder segments (phase 2). The segments may be in a transient shifted state — retry the reorder to fix.',
        code: 'REORDER_PHASE2_FAILED',
      });
    }
  }

  const { data: finalSegments } = await admin
    .from('event_segments')
    .select(
      'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .order('ord', { ascending: true });

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'event_segment_manage',
      entity_type: 'event_run',
      entity_id: runId,
      tenant_id: ctx.tenantId,
      payload: { action: 'reorder_event_segments', orderedIds },
    });
  }

  return res.status(200).json({ segments: finalSegments ?? [] });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-reorder' }),
  'admin'
);
