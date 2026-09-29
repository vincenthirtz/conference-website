// features/admin/events/service/runs.ts — runs du run-of-show :
// liste, création, fiche (segments + vagues + postes), édition, suppression,
// démarrage et clôture.
//
// Journal : famille `event_run_manage`, le verbe précis dans `payload.action`
// (inchangé depuis les routes d'origine).

import slugify from 'slugify';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import * as repo from '../repository';
import { CreateRunBody, UpdateRunBody } from '../schemas';
import type { Audited } from '../../_shared/audited';
import { dbFail, fail, parsePayload, type RowOf, runNotFound } from './common';

type RunRow = RowOf<typeof repo.updateRun>;

const toSlug = (v: string) => slugify(v, { lower: true, strict: true });

function firstString(v: unknown): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x : undefined;
}

/** Même lecture que `parsePagination(req, { limit: 50, maxLimit: 200 })`. */
function pagination(query: Record<string, unknown>) {
  const rawLimit = firstString(query.limit);
  const rawOffset = firstString(query.offset);
  const limit = Math.max(
    1,
    Math.min(200, Number.parseInt(rawLimit ?? '50', 10) || 50)
  );
  const offset = Math.max(0, Number.parseInt(rawOffset ?? '0', 10) || 0);
  return { limit, offset };
}

export async function listRuns(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const { limit, offset } = pagination(query);
  const statusFilter = query.status;
  let status: string | null = null;
  if (typeof statusFilter === 'string' && statusFilter.length > 0) {
    if (!['draft', 'live', 'done'].includes(statusFilter)) {
      throw fail(
        400,
        "status doit etre 'draft', 'live' ou 'done'.",
        'INVALID_STATUS'
      );
    }
    status = statusFilter;
  }
  const { rows, error, count } = await repo.listRuns(ctx.db, ctx.tenantId, {
    status,
    offset,
    limit,
  });
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events] list error',
      error,
      'Failed to load event runs.'
    );
  }
  return { items: rows ?? [], total: count ?? rows?.length ?? 0 };
}

export async function createRun(ctx: ServiceContext, raw: unknown) {
  const body = parsePayload(CreateRunBody, raw);
  const slug = toSlug(body.slug?.trim().length ? body.slug : body.name);
  if (!slug) throw fail(400, 'Slug invalide.', 'INVALID_SLUG');

  if (await repo.findRunIdBySlug(ctx.db, ctx.tenantId, slug)) {
    throw fail(
      409,
      `Un event_run avec le slug "${slug}" existe deja dans ce tenant.`,
      'DUPLICATE_SLUG'
    );
  }

  const { row, error } = await repo.insertRun(ctx.db, {
    tenant_id: ctx.tenantId,
    name: body.name,
    slug,
    description: body.description ?? null,
    scheduled_at: body.scheduled_at,
    status: 'draft',
  });
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events] create error',
      error,
      'Failed to create the event run.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'event_run',
      entity_id: row.id,
      payload: { action: 'create_event_run', slug, name: row.name },
    },
  };
}

/** Lecture commune de la fiche : 500 / 404 historiques, AVANT le corps. */
async function loadRun(ctx: ServiceContext, runId: string) {
  const { row, error } = await repo.getRunDetail(ctx.db, ctx.tenantId, runId);
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] lookup error',
      error,
      'Failed to load event run.'
    );
  }
  if (!row) throw runNotFound();
  return row;
}

export async function getRun(ctx: ServiceContext, runId: string) {
  const run = await loadRun(ctx, runId);
  const segments = await repo.listRunSegments(ctx.db, ctx.tenantId, runId);
  if (segments.error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] segments error',
      segments.error,
      'Failed to load segments.'
    );
  }
  const waves = await repo.listRunWaves(ctx.db, ctx.tenantId, runId);
  if (waves.error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] waves error',
      waves.error,
      'Failed to load waves.'
    );
  }
  const stations = await repo.listRunStations(ctx.db, ctx.tenantId, runId);
  if (stations.error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] stations error',
      stations.error,
      'Failed to load stations.'
    );
  }
  return {
    run,
    segments: segments.rows ?? [],
    waves: waves.rows ?? [],
    stations: stations.rows ?? [],
  };
}

export async function updateRun(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const run = await loadRun(ctx, runId);
  const body = parsePayload(UpdateRunBody, raw);

  const patch: TablesUpdate<'event_runs'> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at;

  if (body.slug !== undefined) {
    const slug = toSlug(body.slug);
    if (!slug) throw fail(400, 'Slug invalide.', 'INVALID_SLUG');
    if (
      slug !== run.slug &&
      (await repo.findRunIdBySlug(ctx.db, ctx.tenantId, slug, runId))
    ) {
      throw fail(
        409,
        `Un event_run avec le slug "${slug}" existe deja dans ce tenant.`,
        'DUPLICATE_SLUG'
      );
    }
    patch.slug = slug;
  }

  if (Object.keys(patch).length === 0) {
    throw fail(400, 'Aucun champ a mettre a jour.', 'EMPTY_UPDATE');
  }

  const { row, error } = await repo.updateRun(
    ctx.db,
    ctx.tenantId,
    runId,
    patch
  );
  if (error || !row) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] update error',
      error,
      'Failed to update event run.'
    );
  }
  return {
    result: row,
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'update_event_run', changes: patch },
    },
  };
}

/**
 * Suppression hard (CASCADE sur les segments), REFUSÉE (409 `run_live`) sur
 * un run en direct : cockpit, console et overlay le suivent.
 */
export async function deleteRun(ctx: ServiceContext, runId: string) {
  const run = await loadRun(ctx, runId);
  const current = await repo.getRunStatusOnly(ctx.db, ctx.tenantId, runId);
  if (current.error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] delete read error',
      current.error,
      'Failed to delete event run.'
    );
  }
  if (current.row?.status === 'live') {
    throw fail(
      409,
      'Ce run est en direct : clôturez-le avant de le supprimer.',
      'run_live'
    );
  }
  const { error } = await repo.deleteRunUnlessLive(ctx.db, ctx.tenantId, runId);
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/[runId]] delete error',
      error,
      'Failed to delete event run.'
    );
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'delete_event_run', slug: run.slug, name: run.name },
    },
  };
}

/** `draft → live`. Déjà live : 200 sans journal. `done` : 409. */
export async function startRun(
  ctx: ServiceContext,
  runId: string
): Promise<
  Audited<{
    run: RowOf<typeof repo.getRunForStart> | RunRow | null;
    alreadyStarted: boolean;
  }>
> {
  const { row: run, error } = await repo.getRunForStart(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/start] lookup error',
      error,
      'Failed to load event run.'
    );
  }
  if (!run) throw runNotFound();
  if (run.status === 'live') {
    return { result: { run, alreadyStarted: true }, audit: { skip: true } };
  }
  if (run.status === 'done') {
    throw fail(
      409,
      'Ce run est marque "done" — impossible de le redemarrer via cet endpoint.',
      'RUN_ALREADY_DONE'
    );
  }

  const now = new Date().toISOString();
  const upd = await repo.transitionRun(ctx.db, ctx.tenantId, runId, 'draft', {
    status: 'live',
    started_at: now,
  });
  if (upd.error) {
    throw dbFail(
      ctx,
      '[admin/events/start] update error',
      upd.error,
      'Failed to start event run.'
    );
  }
  if (!upd.row) {
    // Course : un autre client a changé le statut entre-temps.
    const refreshed = await repo.refetchRun(ctx.db, ctx.tenantId, runId);
    return {
      result: { run: refreshed, alreadyStarted: true },
      audit: { skip: true },
    };
  }
  return {
    result: { run: upd.row, alreadyStarted: false },
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'start_event_run', startedAt: now },
    },
  };
}

/**
 * `live → done` : clôt les segments live (ended_at), force les upcoming en
 * done, puis le run. Déjà done : 200 sans journal. `draft` : 409.
 */
export async function endRun(
  ctx: ServiceContext,
  runId: string
): Promise<
  Audited<{
    run: RowOf<typeof repo.getRunForEnd> | RunRow | null;
    alreadyEnded: boolean;
  }>
> {
  const { row: run, error } = await repo.getRunForEnd(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/events/end] lookup error',
      error,
      'Failed to load event run.'
    );
  }
  if (!run) throw runNotFound();
  if (run.status === 'done') {
    return { result: { run, alreadyEnded: true }, audit: { skip: true } };
  }
  if (run.status === 'draft') {
    throw fail(
      409,
      "Ce run n'a jamais ete demarre (status=draft). Utilise /start avant /end.",
      'RUN_NOT_STARTED'
    );
  }

  const now = new Date().toISOString();
  await repo.closeRunSegments(ctx.db, ctx.tenantId, runId, 'live', {
    status: 'done',
    ended_at: now,
  });
  await repo.closeRunSegments(ctx.db, ctx.tenantId, runId, 'upcoming', {
    status: 'done',
  });

  const upd = await repo.transitionRun(ctx.db, ctx.tenantId, runId, 'live', {
    status: 'done',
    ended_at: now,
  });
  if (upd.error) {
    throw dbFail(
      ctx,
      '[admin/events/end] update error',
      upd.error,
      'Failed to end event run.'
    );
  }
  if (!upd.row) {
    const refreshed = await repo.refetchRun(ctx.db, ctx.tenantId, runId);
    return {
      result: { run: refreshed, alreadyEnded: true },
      audit: { skip: true },
    };
  }
  return {
    result: { run: upd.row, alreadyEnded: false },
    audit: {
      entity_type: 'event_run',
      entity_id: runId,
      payload: { action: 'end_event_run', endedAt: now },
    },
  };
}
