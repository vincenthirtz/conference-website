// features/admin/events/service/segments.ts — segments d'un run : création,
// fiche, édition, suppression, transitions (start / end / skip) et reorder.
//
// Effets de bord conservés : `transitionToSegment` (un seul segment live par
// run, outbox `event_segment.transitioned`) pour /start, et
// `emitSegmentTransitioned` (outbox, best-effort) pour /end et /skip.
// Journal : famille `event_segment_manage`, verbe dans `payload.action`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { transitionToSegment } from '@/utils/broadcast/segmentTransition';
import { emitSegmentTransitioned } from '@/utils/eventSegmentEvents';
import * as repo from '../repository';
import {
  CreateSegmentBody,
  ReorderSegmentsBody,
  UpdateSegmentBody,
} from '../schemas';
import type { Audited } from '../../_shared/audited';
import { dbFail, fail, parsePayload, type RowOf, runNotFound } from './common';

type TransitionedRow = RowOf<typeof repo.transitionSegment>;

/** Décalage de la phase 1 d'un reorder (hors de la plage cible 0..N). */
export const REORDER_OFFSET = 1_000_000;

const segmentNotFound = () => fail(404, 'Segment not found.');

export async function createSegment(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const { row: run } = await repo.getRunStatus(ctx.db, ctx.tenantId, runId);
  if (!run) throw runNotFound();
  const body = parsePayload(CreateSegmentBody, raw);

  if (body.type === 'match' && body.match_id) {
    const match = await repo.findMatchTenant(ctx.db, body.match_id);
    if (!match || match.tenant_id !== ctx.tenantId) {
      throw fail(
        400,
        "Le match_id reference n'existe pas ou n'appartient pas a ce tenant.",
        'INVALID_MATCH_ID'
      );
    }
  }

  let ord = body.ord;
  if (ord === undefined) {
    const last = await repo.lastOrd(
      ctx.db,
      'event_segments',
      ctx.tenantId,
      runId
    );
    ord = last === null ? 0 : last + 1;
  } else if (await repo.findSegmentAtOrd(ctx.db, ctx.tenantId, runId, ord)) {
    // Déplacer un segment passe par /reorder.
    throw fail(
      409,
      `Un segment existe deja en position ord=${ord}. Utilise /reorder ou choisis un autre ord.`,
      'ORD_CONFLICT'
    );
  }

  const { row, error } = await repo.insertSegment(ctx.db, {
    event_run_id: runId,
    tenant_id: ctx.tenantId,
    ord,
    type: body.type,
    match_id: body.match_id ?? null,
    title: body.title,
    duration_min: body.duration_min ?? null,
    planned_start_at: body.planned_start_at ?? null,
    status: 'upcoming',
    broadcast_message: body.broadcast_message ?? null,
    caster_checklist: body.caster_checklist ?? [],
  });
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/segments] insert error',
      error,
      'Failed to create segment.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'event_segment',
      entity_id: row.id,
      payload: { action: 'create_event_segment', runId, type: body.type, ord },
    },
  };
}

async function loadSegment(ctx: ServiceContext, runId: string, segId: string) {
  const { row, error } = await repo.getSegmentDetail(
    ctx.db,
    ctx.tenantId,
    runId,
    segId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/[segId]] lookup error',
      error,
      'Failed to load segment.'
    );
  }
  if (!row) throw segmentNotFound();
  return row;
}

export function getSegment(ctx: ServiceContext, runId: string, segId: string) {
  return loadSegment(ctx, runId, segId);
}

export async function updateSegment(
  ctx: ServiceContext,
  runId: string,
  segId: string,
  raw: unknown
) {
  await loadSegment(ctx, runId, segId);
  const body = parsePayload(UpdateSegmentBody, raw);

  // Une wave/station assignée doit être du même run + tenant.
  if (
    body.wave_id !== undefined &&
    body.wave_id !== null &&
    !(await repo.findWaveInRun(ctx.db, ctx.tenantId, runId, body.wave_id))
  ) {
    throw fail(
      400,
      "La wave_id referencee n'existe pas ou n'appartient pas a ce run.",
      'INVALID_WAVE_ID'
    );
  }
  if (
    body.station_id !== undefined &&
    body.station_id !== null &&
    !(await repo.findStationInRun(ctx.db, ctx.tenantId, runId, body.station_id))
  ) {
    throw fail(
      400,
      "La station_id referencee n'existe pas ou n'appartient pas a ce run.",
      'INVALID_STATION_ID'
    );
  }

  // `obs_scene` est accepté par le schéma mais n'était PAS écrit par la route
  // d'origine : conservé tel quel (cf. rapport de migration).
  const patch: TablesUpdate<'event_segments'> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.duration_min !== undefined) patch.duration_min = body.duration_min;
  if (body.planned_start_at !== undefined)
    patch.planned_start_at = body.planned_start_at;
  if (body.wave_id !== undefined) patch.wave_id = body.wave_id;
  if (body.station_id !== undefined) patch.station_id = body.station_id;
  if (body.broadcast_message !== undefined)
    patch.broadcast_message = body.broadcast_message;
  if (body.caster_checklist !== undefined)
    patch.caster_checklist = body.caster_checklist;

  if (Object.keys(patch).length === 0) {
    throw fail(400, 'Aucun champ a mettre a jour.', 'EMPTY_UPDATE');
  }

  const { row, error } = await repo.updateSegment(
    ctx.db,
    ctx.tenantId,
    runId,
    segId,
    patch
  );
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/seg/[segId]] update error',
      error,
      'Failed to update segment.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'event_segment',
      entity_id: segId,
      payload: { action: 'update_event_segment', changes: patch },
    },
  };
}

export async function deleteSegment(
  ctx: ServiceContext,
  runId: string,
  segId: string
) {
  const segment = await loadSegment(ctx, runId, segId);
  const { error } = await repo.deleteSegment(
    ctx.db,
    ctx.tenantId,
    runId,
    segId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/[segId]] delete error',
      error,
      'Failed to delete segment.'
    );
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'event_segment',
      entity_id: segId,
      payload: { action: 'delete_event_segment', ord: segment.ord },
    },
  };
}

/** `upcoming → live` (un seul live par run). Déjà live : 200 sans journal. */
export async function startSegment(
  ctx: ServiceContext,
  runId: string,
  segId: string
) {
  const result = await transitionToSegment(
    ctx.db as unknown as Parameters<typeof transitionToSegment>[0],
    { runId, tenantId: ctx.tenantId, segId }
  );
  if (!result.ok) {
    if (result.reason === 'not_found') throw segmentNotFound();
    if (result.reason === 'not_upcoming') {
      throw fail(
        409,
        `Le segment est en status '${result.status}', impossible de le demarrer.`,
        'SEGMENT_NOT_UPCOMING',
        { status: result.status }
      );
    }
    throw dbFail(
      ctx,
      '[admin/events/seg/start] transition error',
      result.error,
      'Failed to start segment.'
    );
  }
  if (result.alreadyStarted) {
    return {
      result: { segment: result.segment, alreadyStarted: true },
      audit: { skip: true },
    };
  }
  return {
    result: { segment: result.segment, alreadyStarted: false },
    audit: {
      entity_type: 'event_segment',
      entity_id: segId,
      payload: {
        action: 'start_event_segment',
        runId,
        ord: (result.segment as { ord?: number }).ord ?? null,
      },
    },
  };
}

type SegmentLookup = {
  ord: number;
  type: string;
  title: string;
  duration_min: number | null;
  match_id: string | null;
  broadcast_message: unknown;
};

function emitTransition(
  ctx: ServiceContext,
  where: string,
  runId: string,
  segId: string,
  fromStatus: 'live' | 'upcoming',
  toStatus: 'done' | 'skipped',
  segment: SegmentLookup
) {
  void emitSegmentTransitioned({
    runId,
    segmentId: segId,
    fromStatus,
    toStatus,
    tenantId: ctx.tenantId,
    broadcastMessage: (segment.broadcast_message ?? null) as Parameters<
      typeof emitSegmentTransitioned
    >[0]['broadcastMessage'],
    segment: {
      ord: segment.ord,
      type: segment.type,
      title: segment.title,
      durationMin: segment.duration_min ?? null,
      matchId: segment.match_id ?? null,
    },
  }).catch((e) => ctx.logger.error(`${where} outbox emit error`, e));
}

/** `live → done`. Déjà done : 200 sans journal. Autre statut : 409. */
export async function endSegment(
  ctx: ServiceContext,
  runId: string,
  segId: string
): Promise<
  Audited<{
    segment: RowOf<typeof repo.getSegmentForEnd> | TransitionedRow | null;
    alreadyEnded: boolean;
  }>
> {
  const { row: segment, error } = await repo.getSegmentForEnd(
    ctx.db,
    ctx.tenantId,
    runId,
    segId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/end] lookup error',
      error,
      'Failed to load segment.'
    );
  }
  if (!segment) throw segmentNotFound();
  if (segment.status === 'done') {
    return { result: { segment, alreadyEnded: true }, audit: { skip: true } };
  }
  if (segment.status !== 'live') {
    throw fail(
      409,
      `Le segment est en status '${segment.status}', impossible de le terminer.`,
      'SEGMENT_NOT_LIVE',
      { status: segment.status }
    );
  }

  const now = new Date().toISOString();
  const upd = await repo.transitionSegment(
    ctx.db,
    ctx.tenantId,
    runId,
    segId,
    'live',
    { status: 'done', ended_at: now }
  );
  if (upd.error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/end] update error',
      upd.error,
      'Failed to end segment.'
    );
  }
  if (!upd.row) {
    const refreshed = await repo.refetchSegment(ctx.db, ctx.tenantId, segId);
    return {
      result: { segment: refreshed, alreadyEnded: true },
      audit: { skip: true },
    };
  }

  emitTransition(
    ctx,
    '[admin/events/seg/end]',
    runId,
    segId,
    'live',
    'done',
    segment
  );
  return {
    result: { segment: upd.row, alreadyEnded: false },
    audit: {
      entity_type: 'event_segment',
      entity_id: segId,
      payload: { action: 'end_event_segment', runId, ord: segment.ord },
    },
  };
}

/** `upcoming → skipped`. Déjà skipped : 200 sans journal. Autre : 409. */
export async function skipSegment(
  ctx: ServiceContext,
  runId: string,
  segId: string
): Promise<
  Audited<{
    segment: RowOf<typeof repo.getSegmentForSkip> | TransitionedRow | null;
    alreadySkipped: boolean;
  }>
> {
  const { row: segment, error } = await repo.getSegmentForSkip(
    ctx.db,
    ctx.tenantId,
    runId,
    segId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/skip] lookup error',
      error,
      'Failed to load segment.'
    );
  }
  if (!segment) throw segmentNotFound();
  if (segment.status === 'skipped') {
    return { result: { segment, alreadySkipped: true }, audit: { skip: true } };
  }
  if (segment.status !== 'upcoming') {
    throw fail(
      409,
      `Le segment est en status '${segment.status}', impossible de le skipper.`,
      'SEGMENT_NOT_UPCOMING',
      { status: segment.status }
    );
  }

  const upd = await repo.transitionSegment(
    ctx.db,
    ctx.tenantId,
    runId,
    segId,
    'upcoming',
    { status: 'skipped' }
  );
  if (upd.error) {
    throw dbFail(
      ctx,
      '[admin/events/seg/skip] update error',
      upd.error,
      'Failed to skip segment.'
    );
  }
  if (!upd.row) {
    const refreshed = await repo.refetchSegment(ctx.db, ctx.tenantId, segId);
    return {
      result: { segment: refreshed, alreadySkipped: true },
      audit: { skip: true },
    };
  }

  emitTransition(
    ctx,
    '[admin/events/seg/skip]',
    runId,
    segId,
    'upcoming',
    'skipped',
    segment
  );
  return {
    result: { segment: upd.row, alreadySkipped: false },
    audit: {
      entity_type: 'event_segment',
      entity_id: segId,
      payload: { action: 'skip_event_segment', runId, ord: segment.ord },
    },
  };
}

/**
 * Reorder par « décalage temporaire » : la contrainte UNIQUE (run, ord) et
 * l'absence de transaction supabase-js imposent deux phases (ord + 1M, puis
 * ord final). Un crash entre les deux laisse des ord uniques, juste décalés.
 */
export async function reorderSegments(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const { orderedIds } = parsePayload(ReorderSegmentsBody, raw);

  const { row: run } = await repo.getRunRef(ctx.db, ctx.tenantId, runId);
  if (!run) throw runNotFound();

  const existing = await repo.listChildIds(
    ctx.db,
    'event_segments',
    ctx.tenantId,
    runId
  );
  if (existing.error) {
    throw dbFail(
      ctx,
      '[admin/events/reorder] fetch error',
      existing.error,
      'Failed to load segments.'
    );
  }
  const existingIds = new Set((existing.rows ?? []).map((s) => s.id as string));
  const requestedIds = new Set(orderedIds);

  if (requestedIds.size !== orderedIds.length) {
    throw fail(400, 'orderedIds contient des doublons.', 'DUPLICATE_IDS');
  }
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw fail(
        400,
        `Le segment ${id} n'appartient pas a ce run.`,
        'SEGMENT_NOT_IN_RUN',
        { segmentId: id }
      );
    }
  }
  if (requestedIds.size !== existingIds.size) {
    throw fail(
      400,
      'orderedIds doit contenir tous les segments du run (aucun manquant, aucun en trop).',
      'INCOMPLETE_REORDER',
      { expected: existingIds.size, received: requestedIds.size }
    );
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await repo.setChildOrd(
      ctx.db,
      'event_segments',
      ctx.tenantId,
      runId,
      orderedIds[i],
      REORDER_OFFSET + i
    );
    if (error) {
      throw dbFail(
        ctx,
        '[admin/events/reorder] phase 1 error',
        error,
        'Failed to reorder segments (phase 1).',
        'REORDER_PHASE1_FAILED'
      );
    }
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await repo.setChildOrd(
      ctx.db,
      'event_segments',
      ctx.tenantId,
      runId,
      orderedIds[i],
      i
    );
    if (error) {
      throw dbFail(
        ctx,
        '[admin/events/reorder] phase 2 error',
        error,
        'Failed to reorder segments (phase 2). The segments may be in a transient shifted state — retry the reorder to fix.',
        'REORDER_PHASE2_FAILED'
      );
    }
  }

  const segments = await repo.listSegmentsAfterReorder(
    ctx.db,
    ctx.tenantId,
    runId
  );
  return {
    result: { segments: segments ?? [] },
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'reorder_event_segments', orderedIds },
    },
  };
}
