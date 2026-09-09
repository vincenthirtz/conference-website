// pages/api/admin/events/[runId]/segments/from-scrim.ts
//
// Feature: Run-of-show — pré-remplissage de la timeline depuis un SCRIM.
// Pendant de `from-tournament.ts` : POST crée, en une passe, un segment
// type='match' pour CHAQUE match du scrim, dans l'ordre de diffusion. Les
// segments sont ajoutés À LA QUEUE du run (MAX(ord)+1, +2, …) et l'opération
// est anti-doublon : un match déjà présent dans un segment du run est skippé.
//
// Différence avec le tournoi : un scrim n'a ni stage ni round — c'est une série
// entre deux équipes. L'ordre se réduit donc à horaire → création → id, le même
// que `GET /api/admin/scrims/:id/matches`. Et comme les deux équipes ne changent
// pas d'un match à l'autre, un titre « A vs B » répété N fois serait illisible :
// on numérote (« A vs B — Match 2 ») dès qu'il y a plus d'un match.
//
// Réponse : 200 { segments: [<créés>], created: <n>, skipped: <n> }.
//
// Codes d'erreur :
//   - 400 INVALID_PAYLOAD  : body invalide (scrim_id manquant/non-uuid)
//   - 404                  : run introuvable (ou autre tenant)
//   - 404 SCRIM_NOT_FOUND  : scrim introuvable (ou autre tenant)
//   - 409 RUN_DONE         : run terminé, pas d'ajout possible
//
// Idempotence : header `Idempotency-Key` honoré (withAdminIdempotency), en plus
// de l'anti-doublon métier sur match_id — un double POST identique renvoie la
// même réponse cache pendant 5 min.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const FromScrimSchema = z
  .object({
    scrim_id: z.string().uuid(),
  })
  .strict();

// Colonnes de match nécessaires à l'ordonnancement + au libellé.
type MatchOrderRow = {
  id: string;
  scheduled_at: string | null;
  created_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
};

// Grand sentinel pour ranger les NULL en fin de tri (horaire, création).
const NULL_LAST = Number.MAX_SAFE_INTEGER;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-events-seg-from-scrim'
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

  const parsed = FromScrimSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { scrim_id: scrimId } = parsed.data;

  // 1) Run existe + même tenant.
  const { data: run } = await admin
    .from('event_runs')
    .select('id, tenant_id, status')
    .eq('id', runId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!run) return res.status(404).json({ error: 'Event run not found.' });

  // Pas d'ajout sur un run terminé (cf. convention end.ts / status='done').
  if (run.status === 'done') {
    return res.status(409).json({
      error: "Le run est terminé ('done') : aucun segment ne peut être ajouté.",
      code: 'RUN_DONE',
    });
  }

  // 2) Scrim existe + même tenant. `name` sert de repli de libellé quand les
  // équipes ne sont pas résolues (scrim ouvert, adversaire pas encore fixé).
  const { data: scrim } = await admin
    .from('scrims')
    .select('id, tenant_id, name')
    .eq('id', scrimId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!scrim) {
    return res.status(404).json({
      error: "Le scrim n'existe pas ou n'appartient pas à ce tenant.",
      code: 'SCRIM_NOT_FOUND',
    });
  }

  // 3) Charge les matchs du scrim (non annulés). L'ordre définitif de diffusion
  // est calculé en JS pour rester déterministe quel que soit l'ordre de retour
  // PostgREST — même posture que from-tournament.
  const { data: matchesRaw, error: matchesErr } = await admin
    .from('matches')
    .select('id, scheduled_at, created_at, team1_id, team2_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('scrim_id', scrimId)
    .neq('status', 'cancelled');

  if (matchesErr) {
    logger.error('[admin/events/from-scrim] matches fetch error', matchesErr);
    return res.status(500).json({ error: 'Failed to load scrim matches.' });
  }

  const matches = (matchesRaw ?? []) as MatchOrderRow[];

  const timeOrLast = (v: string | null): number => {
    if (!v) return NULL_LAST;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NULL_LAST;
  };

  const ordered = [...matches].sort((a, b) => {
    const ta = timeOrLast(a.scheduled_at);
    const tb = timeOrLast(b.scheduled_at);
    if (ta !== tb) return ta - tb;

    const ca = timeOrLast(a.created_at);
    const cb = timeOrLast(b.created_at);
    if (ca !== cb) return ca - cb;

    // Tie-break stable ultime : id lexicographique.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // 4) Anti-doublon : match_id déjà présent dans un segment du run → skip.
  const { data: existingSegs } = await admin
    .from('event_segments')
    .select('match_id')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId);

  const existingMatchIds = new Set(
    ((existingSegs ?? []) as Array<{ match_id: string | null }>)
      .map((s) => s.match_id)
      .filter((v): v is string => Boolean(v))
  );

  const toCreate = ordered.filter((m) => !existingMatchIds.has(m.id));
  const skipped = ordered.length - toCreate.length;

  if (toCreate.length === 0) {
    return res.status(200).json({ segments: [], created: 0, skipped });
  }

  // Libellés : résout les noms d'équipes en une requête pour tous les matchs.
  const teamIds = new Set<string>();
  for (const m of toCreate) {
    if (m.team1_id) teamIds.add(m.team1_id);
    if (m.team2_id) teamIds.add(m.team2_id);
  }
  const teamNames = new Map<string, string>();
  if (teamIds.size > 0) {
    const { data: teamsRaw } = await admin
      .from('teams')
      .select('id, name, short_name')
      .eq('tenant_id', ctx.tenantId)
      .in('id', [...teamIds]);
    for (const t of (teamsRaw ?? []) as Array<{
      id: string;
      name: string | null;
      short_name: string | null;
    }>) {
      const label = (t.name ?? t.short_name ?? '').trim();
      if (label) teamNames.set(t.id, label);
    }
  }

  const scrimName = (scrim.name as string | null)?.trim() || '';

  // Les deux équipes sont les mêmes sur toute la série : on numérote dès qu'il
  // y a plus d'un match, sinon « A vs B » suffit.
  const buildTitle = (m: MatchOrderRow, position1Based: number): string => {
    const t1 = m.team1_id ? teamNames.get(m.team1_id) : undefined;
    const t2 = m.team2_id ? teamNames.get(m.team2_id) : undefined;
    const base = t1 && t2 ? `${t1} vs ${t2}` : scrimName || 'Scrim';
    return toCreate.length > 1 ? `${base} — Match ${position1Based}` : base;
  };

  // 5) ord : on empile à la queue du run (MAX(ord)+1, +2, …).
  const { data: lastSeg } = await admin
    .from('event_segments')
    .select('ord')
    .eq('event_run_id', runId)
    .eq('tenant_id', ctx.tenantId)
    .order('ord', { ascending: false })
    .limit(1)
    .maybeSingle();
  const baseOrd = lastSeg ? (lastSeg.ord as number) + 1 : 0;

  const insertPayload = toCreate.map((m, idx) => ({
    event_run_id: runId,
    tenant_id: ctx.tenantId,
    ord: baseOrd + idx,
    type: 'match' as const,
    match_id: m.id,
    title: buildTitle(m, idx + 1),
    duration_min: null,
    planned_start_at: null,
    status: 'upcoming' as const,
    broadcast_message: null,
    caster_checklist: [],
  }));

  const { data: inserted, error: insertErr } = await admin
    .from('event_segments')
    .insert(insertPayload)
    .select(
      'id, ord, type, match_id, wave_id, station_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, obs_scene, created_at, updated_at'
    );

  if (insertErr || !inserted) {
    logger.error('[admin/events/from-scrim] insert error', insertErr);
    return res.status(500).json({ error: 'Failed to create segments.' });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'event_segment_manage',
      entity_type: 'event_run',
      entity_id: String(runId),
      tenant_id: ctx.tenantId,
      payload: {
        action: 'prefill_event_segments_from_scrim',
        runId,
        scrim_id: scrimId,
        created: inserted.length,
        skipped,
      },
    });
  }

  return res.status(200).json({
    segments: inserted,
    created: inserted.length,
    skipped,
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-events-seg-from-scrim' }),
  { permission: 'manage_broadcast' }
);
