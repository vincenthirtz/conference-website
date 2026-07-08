// tests/unit/eventScheduleConflicts.test.ts
//
// Couvre utils/eventScheduleConflicts.ts (detectTeamScheduleConflicts) —
// roadmap #04 (detection des chevauchements d'equipe dans le run-of-show).
// Pure function : on construit un ComputedRunSchedule + des segments a la main,
// pas de mock supabase.

import { describe, it, expect } from 'vitest';
import {
  detectTeamScheduleConflicts,
  type MatchTeams,
} from '../../utils/eventScheduleConflicts';
import type { ComputedRunSchedule } from '../../utils/eventSchedule';
import type { EventSegment } from '../../types/events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = Date.parse('2026-06-01T12:00:00.000Z');

function iso(deltaMin: number): string {
  return new Date(BASE + deltaMin * 60_000).toISOString();
}

function makeSegment(
  overrides: Partial<EventSegment> & { id: string; ord: number }
): EventSegment {
  return {
    id: overrides.id,
    ord: overrides.ord,
    type: overrides.type ?? 'match',
    match_id: overrides.match_id ?? null,
    wave_id: overrides.wave_id ?? null,
    station_id: overrides.station_id ?? null,
    title: overrides.title ?? `Segment ${overrides.ord}`,
    duration_min:
      'duration_min' in overrides ? (overrides.duration_min ?? null) : 15,
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

/**
 * Construit un ComputedRunSchedule minimal a partir de tuples
 * [segmentId, startMin, endMin]. Les autres champs du schedule (drift, live)
 * ne sont pas lus par la detection.
 */
function makeSchedule(
  timings: Array<[string, number, number]>
): ComputedRunSchedule {
  return {
    segments: timings.map(([segmentId, startMin, endMin]) => ({
      segmentId,
      plannedStartAt: iso(startMin),
      isAnchored: false,
      plannedDurationSec: (endMin - startMin) * 60,
      plannedEndAt: iso(endMin),
    })),
    driftSec: 0,
    liveSegmentId: null,
    liveOverrunSec: 0,
  };
}

function teams(
  team1Id: string | null,
  team2Id: string | null,
  extra?: Partial<MatchTeams>
): MatchTeams {
  return { team1Id, team2Id, ...extra };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectTeamScheduleConflicts', () => {
  // -------------------------------------------------------------------------
  // 1. Chevauchement + equipe partagee → conflit.
  // -------------------------------------------------------------------------
  it('overlap with a shared team: reports a conflict', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
    ];
    // s1 [0,20[, s2 [10,30[ → overlap [10,20[.
    const schedule = makeSchedule([
      ['s1', 0, 20],
      ['s2', 10, 30],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamA', { team1Name: 'X', team2Name: 'A' })],
      ['m2', teams('teamX', 'teamB', { team1Name: 'X', team2Name: 'B' })],
    ]);

    const conflicts = detectTeamScheduleConflicts(
      schedule,
      segments,
      matchTeams
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].teamId).toBe('teamX');
    expect(conflicts[0].teamName).toBe('X');
    expect(conflicts[0].segmentAId).toBe('s1'); // s1 commence en premier
    expect(conflicts[0].segmentBId).toBe('s2');
    expect(conflicts[0].matchALabel).toBe('X vs A');
    expect(conflicts[0].matchBLabel).toBe('X vs B');
    expect(conflicts[0].overlapStart).toBe(iso(10));
    expect(conflicts[0].overlapEnd).toBe(iso(20));
  });

  // -------------------------------------------------------------------------
  // 2. Chevauchement SANS equipe commune → pas de conflit.
  // -------------------------------------------------------------------------
  it('overlap without a shared team: no conflict', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
    ];
    const schedule = makeSchedule([
      ['s1', 0, 20],
      ['s2', 10, 30],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamA', 'teamB')],
      ['m2', teams('teamC', 'teamD')],
    ]);

    expect(detectTeamScheduleConflicts(schedule, segments, matchTeams)).toEqual(
      []
    );
  });

  // -------------------------------------------------------------------------
  // 3. Creneaux jointifs (fin de l'un = debut de l'autre) → pas de conflit.
  // -------------------------------------------------------------------------
  it('adjacent (touching) slots with a shared team: no conflict', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
    ];
    // s1 [0,20[, s2 [20,40[ → jointifs, PAS de chevauchement strict.
    const schedule = makeSchedule([
      ['s1', 0, 20],
      ['s2', 20, 40],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamA')],
      ['m2', teams('teamX', 'teamB')],
    ]);

    expect(detectTeamScheduleConflicts(schedule, segments, matchTeams)).toEqual(
      []
    );
  });

  // -------------------------------------------------------------------------
  // 4. Segments non-match / skipped / match_id inconnu → ignores.
  // -------------------------------------------------------------------------
  it('ignores non-match, skipped, and unresolved segments', () => {
    const segments = [
      // break qui chevauche tout : ignore (type != match)
      makeSegment({ id: 'brk', ord: 0, type: 'break', match_id: 'm1' }),
      // skipped : absent du schedule + status skipped
      makeSegment({
        id: 'skip',
        ord: 1,
        match_id: 'm2',
        status: 'skipped',
      }),
      // match_id absent de la Map : ignore
      makeSegment({ id: 'unknown', ord: 2, match_id: 'm-not-in-map' }),
      // match sans match_id : ignore
      makeSegment({ id: 'nomatch', ord: 3, match_id: null }),
    ];
    const schedule = makeSchedule([
      ['brk', 0, 60],
      ['unknown', 0, 60],
      ['nomatch', 0, 60],
      // 'skip' volontairement absent du schedule (skipped).
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamA')],
      ['m2', teams('teamX', 'teamB')],
    ]);

    expect(detectTeamScheduleConflicts(schedule, segments, matchTeams)).toEqual(
      []
    );
  });

  // -------------------------------------------------------------------------
  // 5. Plusieurs conflits (une equipe sur 3 matchs simultanes → 3 paires).
  // -------------------------------------------------------------------------
  it('reports multiple conflicts across overlapping pairs', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
      makeSegment({ id: 's3', ord: 2, match_id: 'm3' }),
    ];
    // 3 matchs qui se chevauchent tous ([0,30[, [5,35[, [10,40[).
    const schedule = makeSchedule([
      ['s1', 0, 30],
      ['s2', 5, 35],
      ['s3', 10, 40],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamA')],
      ['m2', teams('teamX', 'teamB')],
      ['m3', teams('teamX', 'teamC')],
    ]);

    const conflicts = detectTeamScheduleConflicts(
      schedule,
      segments,
      matchTeams
    );

    // Paires (s1,s2), (s1,s3), (s2,s3) partagent toutes teamX.
    expect(conflicts).toHaveLength(3);
    expect(conflicts.every((c) => c.teamId === 'teamX')).toBe(true);
    const pairs = conflicts.map((c) => `${c.segmentAId}-${c.segmentBId}`);
    expect(pairs).toContain('s1-s2');
    expect(pairs).toContain('s1-s3');
    expect(pairs).toContain('s2-s3');
  });

  // -------------------------------------------------------------------------
  // 6. Aucun conflit (aucun chevauchement).
  // -------------------------------------------------------------------------
  it('no overlap at all: no conflict', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
    ];
    const schedule = makeSchedule([
      ['s1', 0, 10],
      ['s2', 20, 30],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamA')],
      ['m2', teams('teamX', 'teamB')],
    ]);

    expect(detectTeamScheduleConflicts(schedule, segments, matchTeams)).toEqual(
      []
    );
  });

  // -------------------------------------------------------------------------
  // 7. Bonus : les deux equipes partagees sur une meme paire → 2 conflits
  //    distincts (un par equipe), pas de doublon.
  // -------------------------------------------------------------------------
  it('two shared teams on the same pair: one conflict per team, deduped', () => {
    const segments = [
      makeSegment({ id: 's1', ord: 0, match_id: 'm1' }),
      makeSegment({ id: 's2', ord: 1, match_id: 'm2' }),
    ];
    const schedule = makeSchedule([
      ['s1', 0, 20],
      ['s2', 5, 25],
    ]);
    const matchTeams = new Map<string, MatchTeams>([
      ['m1', teams('teamX', 'teamY')],
      ['m2', teams('teamY', 'teamX')],
    ]);

    const conflicts = detectTeamScheduleConflicts(
      schedule,
      segments,
      matchTeams
    );

    expect(conflicts).toHaveLength(2);
    const ids = conflicts.map((c) => c.teamId).sort();
    expect(ids).toEqual(['teamX', 'teamY']);
  });
});
