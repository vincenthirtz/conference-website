// features/admin/events/service/cues.ts — cues (tops) diffusés aux casters
// d'un run, et présence dérivée de ces casters.
//
// Cue : création sur un run LIVE seulement ; `dedup_key` → un second writer
// (cron overrun-watcher / client) reçoit 200 `dedupReplayed` sans journal.
// Rétractation : soft-delete (`retracted_at`), idempotente, sans gate live.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { EventCue } from '@/types/events';
import * as repo from '../repository';
import { CreateCueBody } from '../schemas';
import type { Audited } from '../../_shared/audited';
import { dbFail, fail, parsePayload, type RowOf, runNotFound } from './common';

function actorUserId(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.userId : null;
}

/** Statut HTTP variable (201 créé / 200 rejoué) : rendu à la route. */
export async function createCue(
  ctx: ServiceContext,
  runId: string,
  raw: unknown
) {
  const {
    severity,
    body,
    dedup_key: dedupKey,
  } = parsePayload(CreateCueBody, raw);

  const { row: run, error: runErr } = await repo.getRunStatus(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (runErr) {
    throw dbFail(
      ctx,
      '[admin/cues] run lookup error',
      runErr,
      'Failed to load event run.'
    );
  }
  if (!run) throw runNotFound();
  if (run.status !== 'live') {
    throw fail(
      409,
      `Impossible de creer un cue sur un run status='${run.status}'. Le run doit etre live.`,
      'RUN_NOT_LIVE'
    );
  }

  const { row, error } = await repo.insertCue(ctx.db, {
    tenant_id: ctx.tenantId,
    event_run_id: runId,
    severity,
    body,
    created_by_user_id: actorUserId(ctx),
    ...(dedupKey ? { dedup_key: dedupKey } : {}),
  });

  if (error || !row) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === '23505' && dedupKey) {
      const existing = await repo.findCueByDedupKey(
        ctx.db,
        ctx.tenantId,
        dedupKey
      );
      if (existing.error || !existing.row) {
        throw dbFail(
          ctx,
          '[admin/cues] dedup fetch error',
          existing.error,
          'Failed to resolve dedup cue.'
        );
      }
      return {
        status: 200,
        body: { cue: existing.row, dedupReplayed: true },
        audit: { skip: true },
      };
    }
    throw dbFail(
      ctx,
      '[admin/cues] insert error',
      error,
      'Failed to create cue.'
    );
  }

  return {
    status: 201,
    body: { cue: row },
    audit: {
      entity_type: 'event_cue',
      entity_id: row.id,
      payload: {
        action: 'create_event_cue',
        runId,
        severity,
        bodyLength: body.length,
      },
    },
  };
}

/** Cues du run (récents d'abord) + acks, sans N+1. `limit` : 1..100, défaut 50. */
export async function listCues(
  ctx: ServiceContext,
  runId: string,
  rawLimit: unknown
) {
  const limitRaw = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;
  const parsedLimit = Number.parseInt(
    typeof limitRaw === 'string' ? limitRaw : '50',
    10
  );
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 50)
  );

  const { row: run, error: runErr } = await repo.getRunRef(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (runErr) {
    throw dbFail(
      ctx,
      '[admin/cues] run lookup error',
      runErr,
      'Failed to load event run.'
    );
  }
  if (!run) throw runNotFound();

  const cues = await repo.listCues(ctx.db, ctx.tenantId, runId, limit);
  if (cues.error) {
    throw dbFail(
      ctx,
      '[admin/cues] list error',
      cues.error,
      'Failed to load cues.'
    );
  }
  const rows = (cues.rows ?? []) as EventCue[];

  const acksByCue: Record<
    string,
    Array<{
      cast_member_id: string;
      cast_member_name: string;
      acked_at: string;
    }>
  > = {};
  const ackCount: Record<string, number> = {};

  if (rows.length > 0) {
    const acks = await repo.listCueAcks(
      ctx.db,
      ctx.tenantId,
      rows.map((r) => r.id)
    );
    if (acks.error) {
      throw dbFail(
        ctx,
        '[admin/cues] acks list error',
        acks.error,
        'Failed to load cue acks.'
      );
    }
    type AckRow = {
      cue_id: string;
      cast_member_id: string;
      acked_at: string;
      cast_members: { name: string } | { name: string }[] | null;
    };
    for (const a of (acks.rows ?? []) as unknown as AckRow[]) {
      const cm = Array.isArray(a.cast_members)
        ? a.cast_members[0]
        : a.cast_members;
      (acksByCue[a.cue_id] ??= []).push({
        cast_member_id: a.cast_member_id,
        cast_member_name: cm?.name ?? 'Inconnu',
        acked_at: a.acked_at,
      });
      ackCount[a.cue_id] = (ackCount[a.cue_id] ?? 0) + 1;
    }
  }

  return {
    cues: rows.map((c) => ({
      ...c,
      ack_count: ackCount[c.id] ?? 0,
      ack_required: c.severity === 'urgent',
    })),
    acks_by_cue: acksByCue,
  };
}

export async function retractCue(
  ctx: ServiceContext,
  runId: string,
  cueId: string
): Promise<
  Audited<{ cue: RowOf<typeof repo.getCue>; alreadyRetracted?: boolean }>
> {
  const { row: cue, error } = await repo.getCue(
    ctx.db,
    ctx.tenantId,
    runId,
    cueId
  );
  if (error) {
    throw dbFail(
      ctx,
      '[admin/cues/retract] lookup error',
      error,
      'Failed to load cue.'
    );
  }
  if (!cue) throw fail(404, 'Cue not found.');
  if (cue.retracted_at) {
    return { result: { cue, alreadyRetracted: true }, audit: { skip: true } };
  }

  const upd = await repo.retractCue(ctx.db, ctx.tenantId, cueId, {
    retracted_at: new Date().toISOString(),
    retracted_by_user_id: actorUserId(ctx),
  });
  if (upd.error || !upd.row) {
    throw dbFail(
      ctx,
      '[admin/cues/retract] update error',
      upd.error,
      'Failed to retract cue.'
    );
  }
  return {
    result: { cue: upd.row },
    audit: {
      entity_type: 'event_cue',
      entity_id: cueId,
      payload: {
        action: 'retract_event_cue',
        runId,
        severity: upd.row.severity,
      },
    },
  };
}

/* ---- Présence des casters ---- */

type PresenceItem = {
  cast_member_id: string;
  name: string;
  image_url: string | null;
  status: 'online' | 'idle' | 'offline' | 'unknown';
  last_seen_at: string | null;
  user_agent?: string;
};

/**
 * online < 60 s, idle < 180 s, offline au-delà ; unknown sans ligne de
 * présence ou si le caster regarde un AUTRE run.
 */
function deriveStatus(
  lastSeenAtIso: string | null | undefined,
  runIdMatches: boolean,
  nowMs: number
): PresenceItem['status'] {
  if (!lastSeenAtIso || !runIdMatches) return 'unknown';
  const t = Date.parse(lastSeenAtIso);
  if (!Number.isFinite(t)) return 'unknown';
  const ageMs = nowMs - t;
  if (ageMs < 60_000) return 'online';
  if (ageMs < 180_000) return 'idle';
  return 'offline';
}

const STATUS_RANK: Record<PresenceItem['status'], number> = {
  online: 0,
  idle: 1,
  offline: 2,
  unknown: 3,
};

/** Casters assignés aux matchs du run (cast_assignments) + présence dérivée. */
export async function getRunPresence(ctx: ServiceContext, runId: string) {
  const { row: run, error: runErr } = await repo.getRunRef(
    ctx.db,
    ctx.tenantId,
    runId
  );
  if (runErr) {
    throw dbFail(
      ctx,
      '[admin/presence] run lookup error',
      runErr,
      'Failed to load event run.'
    );
  }
  if (!run) throw runNotFound();

  const segs = await repo.listRunSegmentMatches(ctx.db, ctx.tenantId, runId);
  if (segs.error) {
    throw dbFail(
      ctx,
      '[admin/presence] segments error',
      segs.error,
      'Failed to load segments.'
    );
  }
  const matchIds = Array.from(
    new Set(
      (segs.rows ?? [])
        .filter((s) => s.type === 'match' && !!s.match_id)
        .map((s) => s.match_id as string)
    )
  );

  let casterIds: string[] = [];
  if (matchIds.length > 0) {
    const assignments = await repo.listCastAssignmentMembers(
      ctx.db,
      ctx.tenantId,
      matchIds
    );
    if (assignments.error) {
      throw dbFail(
        ctx,
        '[admin/presence] assignments error',
        assignments.error,
        'Failed to load assignments.'
      );
    }
    casterIds = Array.from(
      new Set((assignments.rows ?? []).map((a) => a.cast_member_id as string))
    );
  }
  if (casterIds.length === 0) return { presence: [] as PresenceItem[] };

  const members = await repo.listCastMembersByIds(
    ctx.db,
    ctx.tenantId,
    casterIds
  );
  if (members.error) {
    throw dbFail(
      ctx,
      '[admin/presence] cast_members error',
      members.error,
      'Failed to load cast_members.'
    );
  }
  const active = (members.rows ?? []).filter((m) => m.is_active);
  if (active.length === 0) return { presence: [] as PresenceItem[] };

  const presenceRows = await repo.listCasterPresence(
    ctx.db,
    ctx.tenantId,
    active.map((m) => m.id)
  );
  if (presenceRows.error) {
    throw dbFail(
      ctx,
      '[admin/presence] caster_presence error',
      presenceRows.error,
      'Failed to load presence.'
    );
  }
  const byMember = new Map(
    (presenceRows.rows ?? []).map((p) => [p.cast_member_id as string, p])
  );

  const nowMs = Date.now();
  const presence: PresenceItem[] = active.map((m) => {
    const p = byMember.get(m.id);
    const item: PresenceItem = {
      cast_member_id: m.id,
      name: m.name as string,
      image_url: (m.image_url as string | null) ?? null,
      status: deriveStatus(p?.last_seen_at, p?.event_run_id === runId, nowMs),
      last_seen_at: p?.last_seen_at ?? null,
    };
    if (p?.user_agent) item.user_agent = p.user_agent;
    return item;
  });
  presence.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.name.localeCompare(b.name)
  );
  return { presence };
}
