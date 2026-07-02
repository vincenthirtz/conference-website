// tests/unit/eventSchedule.test.ts
//
// Couvre utils/eventSchedule.ts (computeRunSchedule) — feature Lot 6 timing/drift.
// Pure function, pas de mock supabase necessaire.

import { describe, it, expect } from 'vitest';
import { computeRunSchedule } from '../../utils/eventSchedule';
import type { EventSegment, EventSegmentStatus } from '../../types/events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<EventSegment> & { id: string; ord: number }): EventSegment {
  return {
    id: overrides.id,
    ord: overrides.ord,
    type: overrides.type ?? 'match',
    match_id: overrides.match_id ?? null,
    wave_id: overrides.wave_id ?? null,
    station_id: overrides.station_id ?? null,
    title: overrides.title ?? `Segment ${overrides.ord}`,
    // `?? 15` masquerait un override explicite a `null` → on teste la cle.
    duration_min:
      'duration_min' in overrides ? overrides.duration_min ?? null : 15,
    status: overrides.status ?? 'upcoming',
    started_at: overrides.started_at ?? null,
    ended_at: overrides.ended_at ?? null,
    planned_start_at: overrides.planned_start_at ?? null,
    broadcast_message: overrides.broadcast_message ?? null,
    caster_checklist: overrides.caster_checklist ?? [],
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? null,
  };
}

// Tous les ISO du fichier ancrees sur 2026-06-01 a midi UTC pour un calcul mental simple.
const SCHEDULED = '2026-06-01T12:00:00.000Z';
const SCHEDULED_MS = Date.parse(SCHEDULED);

function isoPlusMin(baseMs: number, deltaMin: number): string {
  return new Date(baseMs + deltaMin * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRunSchedule', () => {
  // -------------------------------------------------------------------------
  // 1. Run pas demarre : computed depuis scheduled_at, drift=0, pas de live.
  // -------------------------------------------------------------------------
  it('run not started: computes from scheduled_at, drift=0, no live segment', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, duration_min: 10 }),
      makeSegment({ id: 's2', ord: 1, duration_min: 20 }),
      makeSegment({ id: 's3', ord: 2, duration_min: 5 }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: null },
      segments,
      SCHEDULED_MS
    );

    expect(r.segments).toHaveLength(3);
    expect(r.segments[0].plannedStartAt).toBe(SCHEDULED);
    expect(r.segments[0].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
    expect(r.segments[1].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
    expect(r.segments[1].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 30));
    expect(r.segments[2].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 30));
    expect(r.segments[2].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 35));
    expect(r.segments.every((s) => s.isAnchored === false)).toBe(true);
    expect(r.driftSec).toBe(0);
    expect(r.liveSegmentId).toBeNull();
    expect(r.liveOverrunSec).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Run live, segments tous upcoming : computed depuis started_at, drift=0.
  // -------------------------------------------------------------------------
  it('run live with all upcoming segments: rebases on started_at, drift=0', () => {
    // Run started 5min apres scheduled.
    const startedAt = isoPlusMin(SCHEDULED_MS, 5);
    const startedMs = Date.parse(startedAt);

    const segments = [
      makeSegment({ id: 's1', ord: 0, duration_min: 10, status: 'upcoming' }),
      makeSegment({ id: 's2', ord: 1, duration_min: 20, status: 'upcoming' }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      startedMs
    );

    expect(r.segments[0].plannedStartAt).toBe(startedAt);
    expect(r.segments[0].plannedEndAt).toBe(isoPlusMin(startedMs, 10));
    expect(r.segments[1].plannedStartAt).toBe(isoPlusMin(startedMs, 10));
    expect(r.driftSec).toBe(0);
    expect(r.liveSegmentId).toBeNull();
    expect(r.liveOverrunSec).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Live segment started 10min ago, duration_min=15 → overrun=0.
  // -------------------------------------------------------------------------
  it('live segment within duration: liveOverrunSec=0', () => {
    const startedAt = SCHEDULED;
    const segLiveStarted = isoPlusMin(SCHEDULED_MS, 0);
    const nowMs = SCHEDULED_MS + 10 * 60_000; // 10min apres start

    const segments = [
      makeSegment({
        id: 'live-1',
        ord: 0,
        duration_min: 15,
        status: 'live' as EventSegmentStatus,
        started_at: segLiveStarted,
      }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      nowMs
    );

    expect(r.liveSegmentId).toBe('live-1');
    expect(r.liveOverrunSec).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. Live segment started 20min ago, duration_min=15 → overrun ≈ 300s.
  // -------------------------------------------------------------------------
  it('live segment overrunning: liveOverrunSec ≈ 300', () => {
    const startedAt = SCHEDULED;
    const segLiveStarted = isoPlusMin(SCHEDULED_MS, 0);
    const nowMs = SCHEDULED_MS + 20 * 60_000;

    const segments = [
      makeSegment({
        id: 'live-1',
        ord: 0,
        duration_min: 15,
        status: 'live',
        started_at: segLiveStarted,
      }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      nowMs
    );

    expect(r.liveSegmentId).toBe('live-1');
    expect(r.liveOverrunSec).toBe(300); // 5min de depassement
  });

  // -------------------------------------------------------------------------
  // 5. Override planned_start_at sur le 2e segment : ancre + le 3e reprend de
  //    la fin du 2e (anchored).
  // -------------------------------------------------------------------------
  it('anchored 2nd segment: 1st computed, 2nd anchored, 3rd resumes from end of 2nd', () => {
    // s1 = 10min depuis SCHEDULED (computed) → plannedEnd = +10min
    // s2 = ancre a +30min (saute de +10 a +30, "trou" de 20min)
    // s3 = computed depuis fin de s2 = +30 + duration(s2)=15 → start=+45
    const anchor2 = isoPlusMin(SCHEDULED_MS, 30);
    const segments = [
      makeSegment({ id: 's1', ord: 0, duration_min: 10 }),
      makeSegment({
        id: 's2',
        ord: 1,
        duration_min: 15,
        planned_start_at: anchor2,
      }),
      makeSegment({ id: 's3', ord: 2, duration_min: 5 }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: null },
      segments,
      SCHEDULED_MS
    );

    expect(r.segments[0].plannedStartAt).toBe(SCHEDULED);
    expect(r.segments[0].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
    expect(r.segments[0].isAnchored).toBe(false);

    expect(r.segments[1].plannedStartAt).toBe(anchor2);
    expect(r.segments[1].isAnchored).toBe(true);
    expect(r.segments[1].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 45));

    expect(r.segments[2].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 45));
    expect(r.segments[2].isAnchored).toBe(false);
    expect(r.segments[2].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 50));
  });

  // -------------------------------------------------------------------------
  // 6. Segment skipped au milieu : ignore dans le walk.
  // -------------------------------------------------------------------------
  it('skipped segment in the middle: ignored in walk', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, duration_min: 10 }),
      makeSegment({ id: 's2-skip', ord: 1, duration_min: 30, status: 'skipped' }),
      makeSegment({ id: 's3', ord: 2, duration_min: 5 }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: null },
      segments,
      SCHEDULED_MS
    );

    expect(r.segments).toHaveLength(2); // skipped filtre
    expect(r.segments[0].segmentId).toBe('s1');
    expect(r.segments[1].segmentId).toBe('s3');
    // s3 prend la place qu'aurait pris le segment skipped : direct apres s1.
    expect(r.segments[1].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
    expect(r.segments[1].plannedEndAt).toBe(isoPlusMin(SCHEDULED_MS, 15));
  });

  // -------------------------------------------------------------------------
  // 7. Drift positif : un segment 'done' s'est fini 2min apres son plannedEnd.
  // -------------------------------------------------------------------------
  it('positive drift: done segment ended 2min after planned → driftSec ≈ 120', () => {
    const startedAt = SCHEDULED;
    // s1 duration=10 → plannedEnd = +10min. ended_at = +12min → drift +120s.
    const endedAt = isoPlusMin(SCHEDULED_MS, 12);

    const segments = [
      makeSegment({
        id: 's1',
        ord: 0,
        duration_min: 10,
        status: 'done',
        started_at: SCHEDULED,
        ended_at: endedAt,
      }),
      makeSegment({ id: 's2', ord: 1, duration_min: 5, status: 'upcoming' }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      Date.parse(endedAt)
    );

    expect(r.driftSec).toBe(120);
  });

  // -------------------------------------------------------------------------
  // 8. Drift negatif : un segment 'done' s'est fini 1min avant son plannedEnd.
  // -------------------------------------------------------------------------
  it('negative drift: done segment ended 1min early → driftSec ≈ -60', () => {
    const startedAt = SCHEDULED;
    // s1 duration=10 → plannedEnd = +10min. ended_at = +9min → drift -60s.
    const endedAt = isoPlusMin(SCHEDULED_MS, 9);

    const segments = [
      makeSegment({
        id: 's1',
        ord: 0,
        duration_min: 10,
        status: 'done',
        started_at: SCHEDULED,
        ended_at: endedAt,
      }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      Date.parse(endedAt)
    );

    expect(r.driftSec).toBe(-60);
  });

  // -------------------------------------------------------------------------
  // 9. Drift depuis le segment live (pas de done) : drift = started − planned.
  // -------------------------------------------------------------------------
  it('drift from live segment (no done yet): started_at − plannedStartAt', () => {
    const startedAt = SCHEDULED;
    // s1 plannedStart = SCHEDULED (run live, premier segment). Si started_at
    // est en retard de 90s → drift +90.
    const liveStarted = isoPlusMin(SCHEDULED_MS, 1.5); // +90s

    const segments = [
      makeSegment({
        id: 's1',
        ord: 0,
        duration_min: 10,
        status: 'live',
        started_at: liveStarted,
      }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: startedAt },
      segments,
      Date.parse(liveStarted)
    );

    expect(r.driftSec).toBe(90);
  });

  // -------------------------------------------------------------------------
  // 10. duration_min=null → plannedDurationSec=0, plannedEnd === plannedStart.
  // -------------------------------------------------------------------------
  it('duration_min=null: segment acts as a zero-duration milestone', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, duration_min: 10 }),
      makeSegment({ id: 's2-jalon', ord: 1, duration_min: null }),
      makeSegment({ id: 's3', ord: 2, duration_min: 5 }),
    ];

    const r = computeRunSchedule(
      { scheduled_at: SCHEDULED, started_at: null },
      segments,
      SCHEDULED_MS
    );

    expect(r.segments[1].segmentId).toBe('s2-jalon');
    expect(r.segments[1].plannedDurationSec).toBe(0);
    expect(r.segments[1].plannedStartAt).toBe(r.segments[1].plannedEndAt);
    expect(r.segments[1].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
    // s3 demarre exactement au meme instant que la fin de s2-jalon.
    expect(r.segments[2].plannedStartAt).toBe(isoPlusMin(SCHEDULED_MS, 10));
  });
});
