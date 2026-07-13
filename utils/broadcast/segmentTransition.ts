// utils/broadcast/segmentTransition.ts
//
// Feature: Run-of-show / Production broadcast automatisée.
//
// SINGLE source of truth for the atomic "single-live-segment swap": promoting
// one segment to `live` while closing any other `live` segment of the same run
// (invariant: at most one live segment per run at a time).
//
// Extracted from pages/api/admin/events/[runId]/segments/[segId]/start.ts so
// the one-click "next match" endpoint reuses the EXACT same logic. Both
// handlers own their own HTTP shaping + staff logging; this util owns the DB
// mutation + the `event_segment.transitioned` outbox emit only.

import type { supabaseAdmin as SupabaseAdminExport } from '../supabase';
import { logger } from '../logger';
import { emitSegmentTransitioned } from '../eventSegmentEvents';

type SupabaseAdminClient = NonNullable<typeof SupabaseAdminExport>;

const SEGMENT_SELECT_FULL =
  'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, caster_checklist, created_at, updated_at';

const SEGMENT_SELECT_LOOKUP =
  'id, ord, type, match_id, title, duration_min, status, started_at, ended_at, broadcast_message, tenant_id';

export type SegmentTransitionResult =
  | { ok: true; segment: Record<string, unknown>; alreadyStarted: boolean }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'db_error'; error: unknown }
  | { ok: false; reason: 'not_upcoming'; status: string };

/**
 * Promote `segId` to `live` within `runId`, closing any other live segment of
 * the run (status→done, ended_at=now). Idempotent: if the target is already
 * live, it's a no-op (no event emitted). Optimistic guard on status='upcoming'
 * handles the concurrent-transition race.
 *
 * Emits `event_segment.transitioned` (best-effort) on a real upcoming→live
 * promotion, matching the original start.ts behavior exactly.
 */
export async function transitionToSegment(
  admin: SupabaseAdminClient,
  params: { runId: string; tenantId: string; segId: string }
): Promise<SegmentTransitionResult> {
  const { runId, tenantId, segId } = params;

  const { data: segment, error: segErr } = await admin
    .from('event_segments')
    .select(SEGMENT_SELECT_LOOKUP)
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (segErr) {
    logger.error('[broadcast/segmentTransition] lookup error', segErr);
    return { ok: false, reason: 'db_error', error: segErr };
  }
  if (!segment) {
    return { ok: false, reason: 'not_found' };
  }

  if (segment.status === 'live') {
    return { ok: true, segment, alreadyStarted: true };
  }
  if (segment.status !== 'upcoming') {
    return {
      ok: false,
      reason: 'not_upcoming',
      status: segment.status as string,
    };
  }

  const now = new Date().toISOString();

  // Cloturer les segments live autres dans le meme run (invariant 1-seul-live).
  await admin
    .from('event_segments')
    .update({ status: 'done', ended_at: now })
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('status', 'live')
    .neq('id', segId);

  // Promotion du segment cible. Optimistic guard sur status='upcoming'.
  const { data: updated, error: updErr } = await admin
    .from('event_segments')
    .update({ status: 'live', started_at: now })
    .eq('id', segId)
    .eq('event_run_id', runId)
    .eq('tenant_id', tenantId)
    .eq('status', 'upcoming')
    .select(SEGMENT_SELECT_FULL)
    .maybeSingle();

  if (updErr) {
    logger.error('[broadcast/segmentTransition] update error', updErr);
    return { ok: false, reason: 'db_error', error: updErr };
  }
  if (!updated) {
    // Race : un autre client a deja transitionne le status.
    const { data: refreshed } = await admin
      .from('event_segments')
      .select(SEGMENT_SELECT_FULL)
      .eq('id', segId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return {
      ok: true,
      segment: (refreshed ?? segment) as Record<string, unknown>,
      alreadyStarted: true,
    };
  }

  // Emet l'event outbox pour fan-out bot. Best-effort : on log mais on
  // n'echoue pas la requete si l'outbox plante.
  void emitSegmentTransitioned({
    runId,
    segmentId: segId,
    fromStatus: 'upcoming',
    toStatus: 'live',
    tenantId,
    broadcastMessage: (segment.broadcast_message as unknown) ?? null,
    segment: {
      ord: segment.ord as number,
      type: segment.type as string,
      title: segment.title as string,
      durationMin: (segment.duration_min as number | null) ?? null,
      matchId: (segment.match_id as string | null) ?? null,
    },
  }).catch((e) =>
    logger.error('[broadcast/segmentTransition] outbox emit error', e)
  );

  return { ok: true, segment: updated, alreadyStarted: false };
}
