// pages/api/admin/events/[runId]/cues/index.ts
//
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// POST : cree un cue broadcast vers tous les casters du run.
//   - severity = 'info' | 'warn' | 'urgent' (ack obligatoire UNIQUEMENT sur urgent).
//   - body = 1–500 caracteres (aligne sur CHECK DB).
//   - Le run doit etre status='live' (sinon 409). Tenant scope strict.
//   - Idempotence : header `Idempotency-Key` honore via withAdminIdempotency.
//   - Auteur tracé via created_by_user_id = ctx.user.id (pas de FK auth.users).
//
// GET  : liste les cues du run + acks. Used by Live Director.
//   - Tri created_at DESC, limit (default 50, max 100). Pas de cursor en V1.
//   - Pour chaque cue : ack_count + ack_required (= severity 'urgent').
//   - acks_by_cue : map cueId -> liste { cast_member_id, name, acked_at }.
//
// Conventions :
//   - withStaffRoute(handler, 'manager') (meme seuil que start/end run).
//   - supabaseAdmin (bypass RLS strict default-deny des 3 tables).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const CreateCueSchema = z.object({
  severity: z.enum(['info', 'warn', 'urgent']),
  body: z.string().trim().min(1).max(500),
  // Lot 6 — clef de dedup logique optionnelle partagee entre le client
  // (useOverrunWatcher dans le Director tab) et le cron server-side
  // (overrun-watcher-cron). Si fournie, un partial UNIQUE INDEX cote DB
  // garantit qu'au plus un cue existe pour cette clef. Le second writer
  // se prend un 23505 et on retourne 200 dedupReplayed=true (no-op
  // idempotent). Format libre cote schema (max 200) ; convention de
  // facto : `auto-overrun:{runId}:{segmentId}`. Cues manuels du
  // Director : dedup_key omis → NULL en DB, hors partial unique.
  dedup_key: z.string().trim().min(1).max(200).optional(),
});

async function postHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  runId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-cue-create'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // Idempotency-Key obligatoire pour CREATE (pas de no-op naturel cote DB).
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || (Array.isArray(idempotencyKey) && idempotencyKey.length === 0)) {
    return res.status(400).json({
      error: 'Idempotency-Key header required.',
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  }

  const parsed = CreateCueSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { severity, body, dedup_key: dedupKey } = parsed.data;

  // Le run doit exister, appartenir au tenant, et etre LIVE.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, tenant_id, status')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/cues] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }
  if (run.status !== 'live') {
    return res.status(409).json({
      error: `Impossible de creer un cue sur un run status='${run.status}'. Le run doit etre live.`,
      code: 'RUN_NOT_LIVE',
    });
  }

  const insertPayload: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    event_run_id: runId,
    severity,
    body,
    created_by_user_id: ctx.user?.id ?? null,
  };
  if (dedupKey) insertPayload.dedup_key = dedupKey;

  const { data: inserted, error: insErr } = await admin
    .from('event_cues')
    .insert(insertPayload)
    .select(
      'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key'
    )
    .single();

  if (insErr || !inserted) {
    // Conflict 23505 sur dedup_key (partial UNIQUE) = un autre writer
    // (client useOverrunWatcher OU cron overrun-watcher) a deja insere
    // un cue avec cette clef. On retourne le cue existant en 200 avec
    // dedupReplayed=true. C'est un succes idempotent : le caller traite
    // ca comme "ok, deja fait".
    const code =
      insErr && typeof insErr === 'object' && 'code' in insErr
        ? (insErr as { code?: string }).code
        : undefined;
    if (code === '23505' && dedupKey) {
      const { data: existing, error: fetchErr } = await admin
        .from('event_cues')
        .select(
          'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key'
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('dedup_key', dedupKey)
        .maybeSingle();
      if (fetchErr || !existing) {
        logger.error('[admin/cues] dedup fetch error', fetchErr);
        return res.status(500).json({ error: 'Failed to resolve dedup cue.' });
      }
      return res
        .status(200)
        .json({ cue: existing, dedupReplayed: true });
    }
    logger.error('[admin/cues] insert error', insErr);
    return res.status(500).json({ error: 'Failed to create cue.' });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'event_cue',
      entity_id: inserted.id,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'create_event_cue',
        runId,
        severity,
        bodyLength: body.length,
      },
    });
  }

  return res.status(201).json({ cue: inserted });
}

async function getHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  runId: string
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-cue-list')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  // Limit : default 50, max 100.
  const rawLimit = req.query.limit;
  const limitRaw = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  const parsedLimit = parseInt(limitRaw ?? '50', 10);
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 50)
  );

  // Verifie ownership du run.
  const { data: run, error: runErr } = await admin
    .from('event_runs')
    .select('id, tenant_id')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (runErr) {
    logger.error('[admin/cues] run lookup error', runErr);
    return res.status(500).json({ error: 'Failed to load event run.' });
  }
  if (!run) {
    return res.status(404).json({ error: 'Event run not found.' });
  }

  const { data: cues, error: cuesErr } = await admin
    .from('event_cues')
    .select(
      'id, event_run_id, severity, body, created_by_user_id, created_at, expires_at, dedup_key'
    )
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cuesErr) {
    logger.error('[admin/cues] list error', cuesErr);
    return res.status(500).json({ error: 'Failed to load cues.' });
  }

  type CueRow = {
    id: string;
    event_run_id: string;
    severity: 'info' | 'warn' | 'urgent';
    body: string;
    created_by_user_id: string | null;
    created_at: string;
    expires_at: string | null;
    dedup_key: string | null;
  };
  const rows: CueRow[] = (cues as CueRow[] | null) ?? [];

  // Fetch acks pour les cues retournes en une seule requete (N+1 evite).
  type AckRow = {
    cue_id: string;
    cast_member_id: string;
    acked_at: string;
    cast_members: { name: string } | { name: string }[] | null;
  };
  const acksByCue: Record<
    string,
    Array<{ cast_member_id: string; cast_member_name: string; acked_at: string }>
  > = {};
  const ackCount: Record<string, number> = {};

  if (rows.length > 0) {
    const cueIds = rows.map((r) => r.id);
    const { data: acks, error: acksErr } = await admin
      .from('event_cue_acks')
      .select('cue_id, cast_member_id, acked_at, cast_members(name)')
      .in('cue_id', cueIds)
      .eq('tenant_id', ctx.tenantId);

    if (acksErr) {
      logger.error('[admin/cues] acks list error', acksErr);
      return res.status(500).json({ error: 'Failed to load cue acks.' });
    }

    for (const a of (acks as AckRow[] | null) ?? []) {
      const cm = Array.isArray(a.cast_members)
        ? a.cast_members[0]
        : a.cast_members;
      const name = cm?.name ?? 'Inconnu';
      if (!acksByCue[a.cue_id]) acksByCue[a.cue_id] = [];
      acksByCue[a.cue_id]!.push({
        cast_member_id: a.cast_member_id,
        cast_member_name: name,
        acked_at: a.acked_at,
      });
      ackCount[a.cue_id] = (ackCount[a.cue_id] ?? 0) + 1;
    }
  }

  const enriched = rows.map((c) => ({
    ...c,
    ack_count: ackCount[c.id] ?? 0,
    ack_required: c.severity === 'urgent',
  }));

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ cues: enriched, acks_by_cue: acksByCue });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { runId } = req.query;
  if (!runId || Array.isArray(runId) || !isValidUUID(runId)) {
    return res.status(400).json({ error: 'Invalid runId.' });
  }

  if (req.method === 'POST') {
    return postHandler(req, res, ctx, runId);
  }
  if (req.method === 'GET') {
    return getHandler(req, res, ctx, runId);
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-cues' }),
  'manager'
);
