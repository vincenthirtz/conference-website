// pages/api/admin/events/[runId]/segments/index.ts
//
// Feature: Run-of-show — Lot 2.
// POST : create segment dans un event_run. Si `ord` absent, l'API calcule
// MAX(ord)+1 (queue). tenant_id est denormalise depuis le run pour permettre
// le filtre realtime/SQL sans JOIN (cf. create_event_segments_table.sql).
//
// Validation Zod : type='match' impose match_id, duration_min > 0 si fourni.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const SegmentTypeSchema = z.enum([
  'match',
  'break',
  'intro',
  'outro',
  'custom',
]);

const ChecklistItemSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  checked_by_user_id: z.string().uuid().nullable().optional(),
  checked_at: z.string().datetime().nullable().optional(),
});

const BroadcastMessageSchema = z
  .object({
    discord: z.string().max(2000).optional(),
    push_title: z.string().max(200).optional(),
    push_body: z.string().max(500).optional(),
    email_subject: z.string().max(200).optional(),
  })
  .strict()
  .nullable();

const CreateSegmentSchema = z
  .object({
    type: SegmentTypeSchema,
    title: z.string().trim().min(1).max(200),
    ord: z.number().int().nonnegative().optional(),
    match_id: z.string().uuid().nullable().optional(),
    duration_min: z.number().int().positive().nullable().optional(),
    // Lot 6 timing : ancrage horaire absolu optionnel. NULL = computed cote UI.
    planned_start_at: z.string().datetime().nullable().optional(),
    broadcast_message: BroadcastMessageSchema.optional(),
    caster_checklist: z.array(ChecklistItemSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'match' && !data.match_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "type='match' impose match_id.",
        path: ['match_id'],
      });
    }
  });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-events-seg')
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

  const { data: run } = await admin
    .from('event_runs')
    .select('id, tenant_id, status')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  const parsed = CreateSegmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const body = parsed.data;

  // Si type=match, on verifie que le match existe ET appartient au tenant.
  if (body.type === 'match' && body.match_id) {
    const { data: match } = await admin
      .from('matches')
      .select('id, tenant_id')
      .eq('id', body.match_id)
      .maybeSingle();
    if (!match || match.tenant_id !== ctx.tenantId) {
      return res.status(400).json({
        error:
          "Le match_id reference n'existe pas ou n'appartient pas a ce tenant.",
        code: 'INVALID_MATCH_ID',
      });
    }
  }

  // ord : si absent, on calcule MAX(ord)+1 (queue).
  let ord = body.ord;
  if (ord === undefined) {
    const { data: lastSeg } = await admin
      .from('event_segments')
      .select('ord')
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .order('ord', { ascending: false })
      .limit(1)
      .maybeSingle();
    ord = lastSeg ? (lastSeg.ord as number) + 1 : 0;
  } else {
    // Si l'utilisateur fournit un ord existant, on rejette (l'UI doit
    // utiliser /reorder pour deplacer un segment).
    const { data: collision } = await admin
      .from('event_segments')
      .select('id')
      .eq('event_run_id', runId)
      .eq('tenant_id', ctx.tenantId)
      .eq('ord', ord)
      .maybeSingle();
    if (collision) {
      return res.status(409).json({
        error: `Un segment existe deja en position ord=${ord}. Utilise /reorder ou choisis un autre ord.`,
        code: 'ORD_CONFLICT',
      });
    }
  }

  const insertPayload = {
    event_run_id: runId,
    tenant_id: ctx.tenantId,
    ord,
    type: body.type,
    match_id: body.match_id ?? null,
    title: body.title,
    duration_min: body.duration_min ?? null,
    planned_start_at: body.planned_start_at ?? null,
    status: 'upcoming' as const,
    broadcast_message: body.broadcast_message ?? null,
    caster_checklist: body.caster_checklist ?? [],
  };

  const { data: inserted, error: insertErr } = await admin
    .from('event_segments')
    .insert(insertPayload)
    .select(
      'id, ord, type, match_id, wave_id, station_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    )
    .single();

  if (insertErr || !inserted) {
    logger.error('[admin/events/segments] insert error', insertErr);
    return res.status(500).json({ error: 'Failed to create segment.' });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'event_segment_manage',
      entity_type: 'event_segment',
      entity_id: inserted.id,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'create_event_segment',
        runId,
        type: body.type,
        ord,
      },
    });
  }

  return res.status(201).json(inserted);
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
