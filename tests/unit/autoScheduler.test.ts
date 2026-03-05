import { describe, it, expect } from 'vitest';
import {
  autoScheduleMatches,
  makeDayWindow,
  makeMultiDayWindows,
} from '../../utils/matches/autoScheduler';
import type { MatchToSchedule, AutoSchedulerConfig } from '../../types/matches';

function makeMatch(
  id: string,
  overrides: Partial<MatchToSchedule> = {}
): MatchToSchedule {
  return {
    id,
    tournamentId: 't1',
    stageId: null,
    team1Id: `team-${id}-1`,
    team2Id: `team-${id}-2`,
    format: 'bo3',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AutoSchedulerConfig> = {}): AutoSchedulerConfig {
  return {
    windows: [makeDayWindow('2026-03-10', '10:00', '22:00')],
    estimatedDurationsMinutes: { bo1: 20, bo3: 45, bo5: 70 },
    resourceGapMinutes: 5,
    teamRestMinutes: 15,
    ...overrides,
  };
}

describe('autoScheduleMatches', () => {
  it('returns all unscheduled when no windows', () => {
    const matches = [makeMatch('m1'), makeMatch('m2')];
    const result = autoScheduleMatches(matches, { ...makeConfig(), windows: [] });

    expect(result.scheduled).toHaveLength(0);
    expect(result.unscheduledMatchIds).toEqual(['m1', 'm2']);
  });

  it('schedules matches sequentially on same resource', () => {
    const matches = [makeMatch('m1'), makeMatch('m2')];
    const result = autoScheduleMatches(matches, makeConfig());

    expect(result.scheduled).toHaveLength(2);
    expect(result.unscheduledMatchIds).toHaveLength(0);

    const start1 = new Date(result.scheduled[0].startAt);
    const end1 = new Date(result.scheduled[0].endAt);
    const start2 = new Date(result.scheduled[1].startAt);

    // Second match starts after first match ends + gap
    expect(start2.getTime()).toBeGreaterThanOrEqual(end1.getTime());
  });

  it('respects team rest time', () => {
    // Same team in two matches → must have rest time between
    const matches = [
      makeMatch('m1', { team1Id: 'teamA', team2Id: 'teamB' }),
      makeMatch('m2', { team1Id: 'teamA', team2Id: 'teamC' }),
    ];

    const config = makeConfig({ teamRestMinutes: 30 });
    const result = autoScheduleMatches(matches, config);

    expect(result.scheduled).toHaveLength(2);

    const end1 = new Date(result.scheduled[0].endAt);
    const start2 = new Date(result.scheduled[1].startAt);

    // teamA must have at least 30 minutes of rest
    const gapMs = start2.getTime() - end1.getTime();
    expect(gapMs).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it('handles locked matches with pinned start', () => {
    const matches = [
      makeMatch('m1', {
        locked: true,
        pinnedStartAt: '2026-03-10T14:00:00.000Z',
      }),
      makeMatch('m2'),
    ];

    const result = autoScheduleMatches(matches, makeConfig());

    const locked = result.scheduled.find((s) => s.matchId === 'm1');
    expect(locked).toBeDefined();
    expect(locked!.startAt).toBe('2026-03-10T14:00:00.000Z');
  });

  it('leaves matches unscheduled when window is too small', () => {
    const matches = [
      makeMatch('m1', { format: 'bo5' }), // 70 min
      makeMatch('m2', { format: 'bo5' }), // 70 min
      makeMatch('m3', { format: 'bo5' }), // 70 min
    ];

    // Only 2.5 hours available
    const config = makeConfig({
      windows: [makeDayWindow('2026-03-10', '10:00', '12:30')],
    });

    const result = autoScheduleMatches(matches, config);

    // Not all can fit
    expect(result.unscheduledMatchIds.length).toBeGreaterThan(0);
    expect(result.scheduled.length + result.unscheduledMatchIds.length).toBe(3);
  });

  it('sorts by roundNumber then priority', () => {
    const matches = [
      makeMatch('m-low', { roundNumber: 2, priority: 1 }),
      makeMatch('m-high', { roundNumber: 1, priority: 1 }),
    ];

    const result = autoScheduleMatches(matches, makeConfig());

    // m-high (round 1) should be scheduled first
    expect(result.scheduled[0].matchId).toBe('m-high');
    expect(result.scheduled[1].matchId).toBe('m-low');
  });
});

describe('makeDayWindow', () => {
  it('creates a window for a given day', () => {
    const w = makeDayWindow('2026-03-10', '10:00', '22:00');
    expect(w.start.getHours()).toBe(10);
    expect(w.start.getMinutes()).toBe(0);
    expect(w.end.getHours()).toBe(22);
    expect(w.end.getMinutes()).toBe(0);
  });
});

describe('makeMultiDayWindows', () => {
  it('creates windows for multiple days', () => {
    const windows = makeMultiDayWindows('2026-03-10', 3, '10:00', '18:00');
    expect(windows).toHaveLength(3);

    expect(windows[0].start.getDate()).toBe(10);
    expect(windows[1].start.getDate()).toBe(11);
    expect(windows[2].start.getDate()).toBe(12);
  });
});
