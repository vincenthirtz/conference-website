// pages/api/admin/events/[runId]/segments/from-tournament.ts
//
// Feature: Run-of-show — pré-remplissage de la timeline.
// POST : crée, en une passe, un segment type='match' pour CHAQUE match d'un
// tournoi, dans un ordre de diffusion sensé (stage → round → horaire). Les
// segments sont ajoutés À LA QUEUE du run (MAX(ord)+1, +2, …) et l'opération
// est anti-doublon : un match déjà présent dans un segment du run est skippé.
//
// Réponse : 200 { segments: [<créés>], created: <n>, skipped: <n> }.
//
// Codes d'erreur :
//   - 400 INVALID_PAYLOAD        : body invalide (tournament_id manquant/non-uuid)
//   - 404                        : run introuvable (ou autre tenant)
//   - 404 TOURNAMENT_NOT_FOUND   : tournoi introuvable (ou autre tenant)
//   - 409 RUN_DONE               : run terminé, pas d'ajout possible
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

const FromTournamentSchema = z
  .object({
    tournament_id: z.string().uuid(),
  })
  .strict();

// Colonnes de match nécessaires à l'ordonnancement + au libellé.
type MatchOrderRow = {
  id: string;
  stage_id: string | null;
  round_number: number | null;
  scheduled_at: string | null;
  created_at: string | null;
  round_name: string | null;
  team1_id: string | null;
  team2_id: string | null;
};

// Grand sentinel pour ranger les NULL en fin de tri (stage/round/horaire).
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
      'admin-events-seg-from-tournament'
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

  const parsed = FromTournamentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { tournament_id: tournamentId } = parsed.data;

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

  // 2) Tournoi existe + même tenant.
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, tenant_id')
    .eq('id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!tournament) {
    return res.status(404).json({
      error: "Le tournoi n'existe pas ou n'appartient pas à ce tenant.",
      code: 'TOURNAMENT_NOT_FOUND',
    });
  }

  // 3) Charge les matchs du tournoi (non annulés). L'ordre définitif de
  // diffusion est calculé en JS (stage → round → horaire → création) pour
  // rester déterministe quel que soit l'ordre de retour PostgREST.
  const { data: matchesRaw, error: matchesErr } = await admin
    .from('matches')
    .select(
      'id, stage_id, round_number, scheduled_at, created_at, round_name, team1_id, team2_id'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('tournament_id', tournamentId)
    .neq('status', 'cancelled');

  if (matchesErr) {
    logger.error(
      '[admin/events/from-tournament] matches fetch error',
      matchesErr
    );
    return res
      .status(500)
      .json({ error: 'Failed to load tournament matches.' });
  }

  const matches = (matchesRaw ?? []) as MatchOrderRow[];

  // Rang de stage : on résout order_index depuis tournament_stages. Un match
  // sans stage (stage_id null) ou pointant vers un stage inconnu est rangé en
  // fin (NULL_LAST) tout en restant inséré.
  const { data: stagesRaw } = await admin
    .from('tournament_stages')
    .select('id, order_index')
    .eq('tenant_id', ctx.tenantId)
    .eq('tournament_id', tournamentId);

  const stageOrder = new Map<string, number>();
  for (const s of (stagesRaw ?? []) as Array<{
    id: string;
    order_index: number | null;
  }>) {
    stageOrder.set(
      s.id,
      typeof s.order_index === 'number' ? s.order_index : NULL_LAST
    );
  }

  const stageRank = (stageId: string | null): number => {
    if (!stageId) return NULL_LAST;
    return stageOrder.get(stageId) ?? NULL_LAST;
  };
  const numOrLast = (v: number | null): number =>
    typeof v === 'number' ? v : NULL_LAST;
  const timeOrLast = (v: string | null): number => {
    if (!v) return NULL_LAST;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NULL_LAST;
  };

  const ordered = [...matches].sort((a, b) => {
    const sa = stageRank(a.stage_id);
    const sb = stageRank(b.stage_id);
    if (sa !== sb) return sa - sb;

    const ra = numOrLast(a.round_number);
    const rb = numOrLast(b.round_number);
    if (ra !== rb) return ra - rb;

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

  const buildTitle = (m: MatchOrderRow, position1Based: number): string => {
    const t1 = m.team1_id ? teamNames.get(m.team1_id) : undefined;
    const t2 = m.team2_id ? teamNames.get(m.team2_id) : undefined;
    if (t1 && t2) return `${t1} vs ${t2}`;
    const label = (m.round_name ?? '').trim();
    if (label) return label;
    return `Match ${position1Based}`;
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
      'id, ord, type, match_id, wave_id, station_id, title, duration_min, planned_start_at, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at'
    );

  if (insertErr || !inserted) {
    logger.error('[admin/events/from-tournament] insert error', insertErr);
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
        action: 'prefill_event_segments_from_tournament',
        runId,
        tournament_id: tournamentId,
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
  withAdminIdempotency(handler, { key: 'admin-events-seg-from-tournament' }),
  { permission: 'manage_broadcast' }
);
