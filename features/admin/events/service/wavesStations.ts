// features/admin/events/service/wavesStations.ts — vagues (waves) et postes
// (stations) d'un run : liste, création (ord MAX+1 par défaut), édition,
// suppression, et reorder des vagues.
//
// Journal : familles `event_wave_manage` / `event_station_manage`, verbe dans
// `payload.action`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import * as repo from '../repository';
import {
  CreateStationBody,
  CreateWaveBody,
  ReorderWavesBody,
  UpdateStationBody,
  UpdateWaveBody,
} from '../schemas';
import { dbFail, fail, parsePayload, runNotFound } from './common';
import { REORDER_OFFSET } from './segments';

/** Run requis par les listes / créations (500 puis 404 historiques). */
async function requireRun(ctx: ServiceContext, runId: string, where: string) {
  const { row, error } = await repo.getRunRef(ctx.db, ctx.tenantId, runId);
  if (error) {
    throw dbFail(
      ctx,
      `${where} run lookup error`,
      error,
      'Failed to load event run.'
    );
  }
  if (!row) throw runNotFound();
}

async function nextOrd(
  ctx: ServiceContext,
  table: 'event_waves' | 'event_stations',
  runId: string
) {
  const last = await repo.lastOrd(ctx.db, table, ctx.tenantId, runId);
  return last === null ? 0 : last + 1;
}

/* ---- Vagues ---- */

export async function listWaves(ctx: ServiceContext, runId: string) {
  await requireRun(ctx, runId, '[admin/events/waves]');
  const { rows, error } = await repo.listRunWaves(ctx.db, ctx.tenantId, runId);
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/waves] list error',
      error,
      'Failed to load waves.'
    );
  }
  return { waves: rows ?? [] };
}

export async function createWave(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  await requireRun(ctx, runId, '[admin/events/waves]');
  const body = parsePayload(CreateWaveBody, raw);
  const ord = body.ord ?? (await nextOrd(ctx, 'event_waves', runId));

  const { row, error } = await repo.insertWave(ctx.db, {
    event_run_id: runId,
    tenant_id: ctx.tenantId,
    ord,
    title: body.title,
    planned_start_at: body.planned_start_at ?? null,
    duration_min: body.duration_min ?? null,
    status: 'upcoming',
  });
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/waves] insert error',
      error,
      'Failed to create wave.'
    );
  }
  return {
    result: { wave: row },
    audit: {
      entity_type: 'event_wave',
      entity_id: row.id,
      payload: { action: 'create_event_wave', runId, ord },
    },
  };
}

async function loadWave(ctx: ServiceContext, runId: string, waveId: string) {
  const { row, error } = await repo.getWave(
    ctx.db,
    ctx.tenantId,
    runId,
    waveId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/waves/[waveId]] lookup error',
      error,
      'Failed to load wave.'
    );
  }
  if (!row) throw fail(404, 'Wave not found.');
  return row;
}

/**
 * Mise à jour partielle. Transitions auto-datées (sauf valeur explicite) :
 * live + started_at null → now ; done + ended_at null → now.
 */
export async function updateWave(
  ctx: ServiceContext,
  runId: string,
  waveId: string,
  raw: unknown
) {
  const wave = await loadWave(ctx, runId, waveId);
  const body = parsePayload(UpdateWaveBody, raw);

  const patch: TablesUpdate<'event_waves'> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.planned_start_at !== undefined)
    patch.planned_start_at = body.planned_start_at;
  if (body.duration_min !== undefined) patch.duration_min = body.duration_min;
  if (body.status !== undefined) patch.status = body.status;
  if (body.started_at !== undefined) patch.started_at = body.started_at;
  if (body.ended_at !== undefined) patch.ended_at = body.ended_at;

  const now = new Date().toISOString();
  if (
    body.status === 'live' &&
    body.started_at === undefined &&
    wave.started_at === null
  ) {
    patch.started_at = now;
  }
  if (
    body.status === 'done' &&
    body.ended_at === undefined &&
    wave.ended_at === null
  ) {
    patch.ended_at = now;
  }

  const { row, error } = await repo.updateWave(
    ctx.db,
    ctx.tenantId,
    runId,
    waveId,
    patch
  );
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/waves/[waveId]] update error',
      error,
      'Failed to update wave.'
    );
  }
  return {
    result: { wave: row },
    audit: {
      entity_type: 'event_wave',
      entity_id: waveId,
      payload: { action: 'update_event_wave', changes: patch },
    },
  };
}

/** Suppression hard ; `event_segments.wave_id` passe à NULL (FK SET NULL). */
export async function deleteWave(
  ctx: ServiceContext,
  runId: string,
  waveId: string
) {
  const wave = await loadWave(ctx, runId, waveId);
  const { error } = await repo.deleteWave(ctx.db, ctx.tenantId, runId, waveId);
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/waves/[waveId]] delete error',
      error,
      'Failed to delete wave.'
    );
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'event_wave',
      entity_id: waveId,
      payload: { action: 'delete_event_wave', ord: wave.ord },
    },
  };
}

/** Reorder des vagues en deux phases (cf. reorderSegments). */
export async function reorderWaves(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const { order } = parsePayload(ReorderWavesBody, raw);

  const { row: run } = await repo.getRunRef(ctx.db, ctx.tenantId, runId);
  if (!run) throw runNotFound();

  const existing = await repo.listChildIds(
    ctx.db,
    'event_waves',
    ctx.tenantId,
    runId
  );
  if (existing.error) {
    throw dbFail(
      ctx,
      '[admin/events/waves/reorder] fetch error',
      existing.error,
      'Failed to load waves.'
    );
  }
  const existingIds = new Set((existing.rows ?? []).map((w) => w.id as string));
  const requestedIds = new Set(order.map((o) => o.id));
  const requestedOrds = new Set(order.map((o) => o.ord));

  if (requestedIds.size !== order.length) {
    throw fail(400, 'order contient des ids en double.', 'DUPLICATE_IDS');
  }
  if (requestedOrds.size !== order.length) {
    throw fail(400, 'order contient des ord en double.', 'DUPLICATE_ORDS');
  }
  for (const { id } of order) {
    if (!existingIds.has(id)) {
      throw fail(
        400,
        `La wave ${id} n'appartient pas a ce run.`,
        'WAVE_NOT_IN_RUN',
        {
          waveId: id,
        }
      );
    }
  }
  if (requestedIds.size !== existingIds.size) {
    throw fail(
      400,
      'order doit contenir toutes les waves du run (aucune manquante, aucune en trop).',
      'INCOMPLETE_REORDER',
      { expected: existingIds.size, received: requestedIds.size }
    );
  }

  for (let i = 0; i < order.length; i++) {
    const { error } = await repo.setChildOrd(
      ctx.db,
      'event_waves',
      ctx.tenantId,
      runId,
      order[i].id,
      REORDER_OFFSET + i
    );
    if (error) {
      throw dbFail(
        ctx,
        '[admin/events/waves/reorder] phase 1 error',
        error,
        'Failed to reorder waves (phase 1).',
        'REORDER_PHASE1_FAILED'
      );
    }
  }
  for (const { id, ord } of order) {
    const { error } = await repo.setChildOrd(
      ctx.db,
      'event_waves',
      ctx.tenantId,
      runId,
      id,
      ord
    );
    if (error) {
      throw dbFail(
        ctx,
        '[admin/events/waves/reorder] phase 2 error',
        error,
        'Failed to reorder waves (phase 2). The waves may be in a transient shifted state — retry the reorder to fix.',
        'REORDER_PHASE2_FAILED'
      );
    }
  }

  const { rows } = await repo.listRunWaves(ctx.db, ctx.tenantId, runId);
  return {
    result: { success: true, waves: rows ?? [] },
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'reorder_event_waves', order },
    },
  };
}

/* ---- Postes ---- */

export async function listStations(ctx: ServiceContext, runId: string) {
  await requireRun(ctx, runId, '[admin/events/stations]');
  const { rows, error } = await repo.listRunStations(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/stations] list error',
      error,
      'Failed to load stations.'
    );
  }
  return { stations: rows ?? [] };
}

export async function createStation(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  await requireRun(ctx, runId, '[admin/events/stations]');
  const body = parsePayload(CreateStationBody, raw);
  const ord = body.ord ?? (await nextOrd(ctx, 'event_stations', runId));

  const { row, error } = await repo.insertStation(ctx.db, {
    event_run_id: runId,
    tenant_id: ctx.tenantId,
    ord,
    name: body.name,
    stream_url: body.stream_url ?? null,
    notes: body.notes ?? null,
    status: 'idle',
  });
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/stations] insert error',
      error,
      'Failed to create station.'
    );
  }
  return {
    result: { station: row },
    audit: {
      entity_type: 'event_station',
      entity_id: row.id,
      payload: { action: 'create_event_station', runId, ord },
    },
  };
}

async function loadStation(
  ctx: ServiceContext,
  runId: string,
  stationId: string
) {
  const { row, error } = await repo.getStation(
    ctx.db,
    ctx.tenantId,
    runId,
    stationId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/stations/[stationId]] lookup error',
      error,
      'Failed to load station.'
    );
  }
  if (!row) throw fail(404, 'Station not found.');
  return row;
}

export async function updateStation(
  ctx: ServiceContext,
  runId: string,
  stationId: string,
  raw: unknown
) {
  await loadStation(ctx, runId, stationId);
  const body = parsePayload(UpdateStationBody, raw);

  const patch: TablesUpdate<'event_stations'> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.stream_url !== undefined) patch.stream_url = body.stream_url;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status;
  if (body.ord !== undefined) patch.ord = body.ord;

  const { row, error } = await repo.updateStation(
    ctx.db,
    ctx.tenantId,
    runId,
    stationId,
    patch
  );
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/stations/[stationId]] update error',
      error,
      'Failed to update station.'
    );
  }
  return {
    result: { station: row },
    audit: {
      entity_type: 'event_station',
      entity_id: stationId,
      payload: { action: 'update_event_station', changes: patch },
    },
  };
}

/** Suppression hard ; `event_segments.station_id` passe à NULL (FK SET NULL). */
export async function deleteStation(
  ctx: ServiceContext,
  runId: string,
  stationId: string
) {
  const station = await loadStation(ctx, runId, stationId);
  const { error } = await repo.deleteStation(
    ctx.db,
    ctx.tenantId,
    runId,
    stationId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/stations/[stationId]] delete error',
      error,
      'Failed to delete station.'
    );
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'event_station',
      entity_id: stationId,
      payload: { action: 'delete_event_station', name: station.name },
    },
  };
}
