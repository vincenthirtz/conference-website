// features/admin/events/service/prefill.ts — préremplissage de la timeline
// d'un run depuis un SCRIM ou un TOURNOI : un segment `match` par match non
// annulé, dans l'ordre de diffusion, empilé à la queue du run, sans doublon
// (un match déjà présent dans le run est compté en `skipped`).
//
// Tournoi : stage (order_index) → round → horaire → création → id.
// Scrim   : horaire → création → id ; titre numéroté (« A vs B — Match 2 »)
//           dès qu'il y a plus d'un match (mêmes équipes sur toute la série).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import * as repo from '../repository';
import { FromScrimBody, FromTournamentBody } from '../schemas';
import { dbFail, fail, parsePayload, runNotFound } from './common';

/** Grand sentinel : les NULL se rangent en fin de tri. */
const NULL_LAST = Number.MAX_SAFE_INTEGER;

type BaseMatch = {
  id: string;
  scheduled_at: string | null;
  created_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
};

const timeOrLast = (v: string | null): number => {
  if (!v) return NULL_LAST;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : NULL_LAST;
};

const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Run existant, du tenant, et pas terminé. */
async function requireOpenRun(ctx: ServiceContext, runId: string) {
  const { row: run } = await repo.getRunStatus(ctx.db, ctx.tenantId, runId);
  if (!run) throw runNotFound();
  if (run.status === 'done') {
    throw fail(
      409,
      "Le run est terminé ('done') : aucun segment ne peut être ajouté.",
      'RUN_DONE'
    );
  }
}

async function teamNamesFor(ctx: ServiceContext, matches: BaseMatch[]) {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.team1_id) ids.add(m.team1_id);
    if (m.team2_id) ids.add(m.team2_id);
  }
  const names = new Map<string, string>();
  if (ids.size === 0) return names;
  for (const t of await repo.listTeamNames(ctx.db, ctx.tenantId, [...ids])) {
    const label = (t.name ?? t.short_name ?? '').trim();
    if (label) names.set(t.id, label);
  }
  return names;
}

/** Écarte les matchs déjà dans le run, crée les autres à la queue. */
async function appendMatchSegments<M extends BaseMatch>(
  ctx: ServiceContext,
  runId: string,
  ordered: M[],
  buildTitle: (
    m: M,
    position1Based: number,
    total: number,
    teams: Map<string, string>
  ) => string,
  where: string
) {
  const existing = new Set(
    (await repo.listRunSegmentMatchIds(ctx.db, ctx.tenantId, runId))
      .map((s) => s.match_id)
      .filter((v): v is string => Boolean(v))
  );
  const toCreate = ordered.filter((m) => !existing.has(m.id));
  const skipped = ordered.length - toCreate.length;
  if (toCreate.length === 0) {
    return { segments: [], created: 0, skipped, inserted: null };
  }

  const teams = await teamNamesFor(ctx, toCreate);
  const last = await repo.lastOrd(
    ctx.db,
    'event_segments',
    ctx.tenantId,
    runId
  );
  const baseOrd = last === null ? 0 : last + 1;

  const { rows, error } = await repo.insertSegments(
    ctx.db,
    toCreate.map((m, idx) => ({
      event_run_id: runId,
      tenant_id: ctx.tenantId,
      ord: baseOrd + idx,
      type: 'match',
      match_id: m.id,
      title: buildTitle(m, idx + 1, toCreate.length, teams),
      duration_min: null,
      planned_start_at: null,
      status: 'upcoming',
      broadcast_message: null,
      caster_checklist: [],
    }))
  );
  if (error || !rows) {
    throw dbFail(
      ctx,
      `${where} insert error`,
      error,
      'Failed to create segments.'
    );
  }
  return { segments: rows, created: rows.length, skipped, inserted: rows };
}

export async function prefillFromScrim(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const { scrim_id: scrimId } = parsePayload(FromScrimBody, raw);
  await requireOpenRun(ctx, runId);

  const scrim = await repo.findScrim(ctx.db, ctx.tenantId, scrimId);
  if (!scrim) {
    throw fail(
      404,
      "Le scrim n'existe pas ou n'appartient pas à ce tenant.",
      'SCRIM_NOT_FOUND'
    );
  }

  const { rows, error } = await repo.listScrimMatches(
    ctx.db,
    ctx.tenantId,
    scrimId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/from-scrim] matches fetch error',
      error,
      'Failed to load scrim matches.'
    );
  }
  const ordered = [...((rows ?? []) as BaseMatch[])].sort((a, b) => {
    const ta = timeOrLast(a.scheduled_at);
    const tb = timeOrLast(b.scheduled_at);
    if (ta !== tb) return ta - tb;
    const ca = timeOrLast(a.created_at);
    const cb = timeOrLast(b.created_at);
    if (ca !== cb) return ca - cb;
    return idOrder(a.id, b.id);
  });

  const scrimName = (scrim.name as string | null)?.trim() || '';
  const out = await appendMatchSegments(
    ctx,
    runId,
    ordered,
    (m, pos, total, teams) => {
      const t1 = m.team1_id ? teams.get(m.team1_id) : undefined;
      const t2 = m.team2_id ? teams.get(m.team2_id) : undefined;
      const base = t1 && t2 ? `${t1} vs ${t2}` : scrimName || 'Scrim';
      return total > 1 ? `${base} — Match ${pos}` : base;
    },
    '[admin/events/from-scrim]'
  );

  const result = {
    segments: out.segments,
    created: out.created,
    skipped: out.skipped,
  };
  if (!out.inserted) return { result, audit: { skip: true } };
  return {
    result,
    audit: {
      entity_type: 'event_run',
      entity_id: String(runId),
      payload: {
        action: 'prefill_event_segments_from_scrim',
        runId,
        scrim_id: scrimId,
        created: out.created,
        skipped: out.skipped,
      },
    },
  };
}

type TournamentMatch = BaseMatch & {
  stage_id: string | null;
  round_number: number | null;
  round_name: string | null;
};

export async function prefillFromTournament(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const { tournament_id: tournamentId } = parsePayload(FromTournamentBody, raw);
  await requireOpenRun(ctx, runId);

  if (!(await repo.findTournament(ctx.db, ctx.tenantId, tournamentId))) {
    throw fail(
      404,
      "Le tournoi n'existe pas ou n'appartient pas à ce tenant.",
      'TOURNAMENT_NOT_FOUND'
    );
  }

  const { rows, error } = await repo.listTournamentMatches(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/from-tournament] matches fetch error',
      error,
      'Failed to load tournament matches.'
    );
  }

  const stageOrder = new Map<string, number>();
  for (const s of await repo.listTournamentStageOrder(
    ctx.db,
    ctx.tenantId,
    tournamentId
  )) {
    stageOrder.set(
      s.id,
      typeof s.order_index === 'number' ? s.order_index : NULL_LAST
    );
  }
  const stageRank = (id: string | null) =>
    id ? (stageOrder.get(id) ?? NULL_LAST) : NULL_LAST;
  const numOrLast = (v: number | null) =>
    typeof v === 'number' ? v : NULL_LAST;

  const ordered = [...((rows ?? []) as TournamentMatch[])].sort((a, b) => {
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
    return idOrder(a.id, b.id);
  });

  const out = await appendMatchSegments(
    ctx,
    runId,
    ordered,
    (m, pos, _total, teams) => {
      const t1 = m.team1_id ? teams.get(m.team1_id) : undefined;
      const t2 = m.team2_id ? teams.get(m.team2_id) : undefined;
      if (t1 && t2) return `${t1} vs ${t2}`;
      const label = (m.round_name ?? '').trim();
      return label || `Match ${pos}`;
    },
    '[admin/events/from-tournament]'
  );

  const result = {
    segments: out.segments,
    created: out.created,
    skipped: out.skipped,
  };
  if (!out.inserted) return { result, audit: { skip: true } };
  return {
    result,
    audit: {
      entity_type: 'event_run',
      entity_id: String(runId),
      payload: {
        action: 'prefill_event_segments_from_tournament',
        runId,
        tournament_id: tournamentId,
        created: out.created,
        skipped: out.skipped,
      },
    },
  };
}
