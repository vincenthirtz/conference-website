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

function makeConfig(
  overrides: Partial<AutoSchedulerConfig> = {}
): AutoSchedulerConfig {
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
    const result = autoScheduleMatches(matches, {
      ...makeConfig(),
      windows: [],
    });

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

  it('avoids double-booking when locked matches occupy team slots', () => {
    // m-locked is already scheduled (locked) with teamA at 10:00
    // m-new also involves teamA → must not overlap with m-locked
    const matches = [
      makeMatch('m-locked', {
        team1Id: 'teamA',
        team2Id: 'teamB',
        locked: true,
        pinnedStartAt: '2026-03-10T10:00:00.000Z',
        format: 'bo3', // 45 min
      }),
      makeMatch('m-new', {
        team1Id: 'teamA',
        team2Id: 'teamC',
        format: 'bo1', // 20 min
      }),
    ];

    const config = makeConfig({ teamRestMinutes: 15 });
    const result = autoScheduleMatches(matches, config);

    expect(result.scheduled).toHaveLength(2);

    const locked = result.scheduled.find((s) => s.matchId === 'm-locked')!;
    const newMatch = result.scheduled.find((s) => s.matchId === 'm-new')!;

    const lockedEnd = new Date(locked.endAt);
    const newStart = new Date(newMatch.startAt);

    // m-new must start at least 15 min after m-locked ends (team rest)
    expect(newStart.getTime()).toBeGreaterThanOrEqual(
      lockedEnd.getTime() + 15 * 60_000
    );
  });

  it('prevents scheduling at same time as locked match for same team', () => {
    // Two locked matches block teamA from 10:00–10:45 and 11:00–11:45
    // A new match with teamA must be scheduled after 11:45 + rest
    const matches = [
      makeMatch('m-locked-1', {
        team1Id: 'teamA',
        team2Id: 'teamX',
        locked: true,
        pinnedStartAt: '2026-03-10T10:00:00.000Z',
        format: 'bo3',
      }),
      makeMatch('m-locked-2', {
        team1Id: 'teamY',
        team2Id: 'teamA',
        locked: true,
        pinnedStartAt: '2026-03-10T11:00:00.000Z',
        format: 'bo3',
      }),
      makeMatch('m-new', {
        team1Id: 'teamA',
        team2Id: 'teamZ',
        format: 'bo1',
      }),
    ];

    const config = makeConfig({ teamRestMinutes: 15 });
    const result = autoScheduleMatches(matches, config);

    expect(result.scheduled).toHaveLength(3);

    const newMatch = result.scheduled.find((s) => s.matchId === 'm-new')!;
    const locked2 = result.scheduled.find((s) => s.matchId === 'm-locked-2')!;
    const locked2End = new Date(locked2.endAt);
    const newStart = new Date(newMatch.startAt);

    // Must start after locked-2 ends + team rest
    expect(newStart.getTime()).toBeGreaterThanOrEqual(
      locked2End.getTime() + 15 * 60_000
    );
  });

  it('does not double-book when both teams overlap with locked matches', () => {
    // teamA busy at 10:00, teamB busy at 11:00
    // A match teamA vs teamB must wait for both to be free
    const matches = [
      makeMatch('m-locked-a', {
        team1Id: 'teamA',
        team2Id: 'teamX',
        locked: true,
        pinnedStartAt: '2026-03-10T10:00:00.000Z',
        format: 'bo3', // ends ~10:45
      }),
      makeMatch('m-locked-b', {
        team1Id: 'teamB',
        team2Id: 'teamY',
        locked: true,
        pinnedStartAt: '2026-03-10T11:00:00.000Z',
        format: 'bo3', // ends ~11:45
      }),
      makeMatch('m-new', {
        team1Id: 'teamA',
        team2Id: 'teamB',
        format: 'bo1',
      }),
    ];

    const config = makeConfig({ teamRestMinutes: 15 });
    const result = autoScheduleMatches(matches, config);

    expect(result.scheduled).toHaveLength(3);

    const newMatch = result.scheduled.find((s) => s.matchId === 'm-new')!;
    const lockedB = result.scheduled.find((s) => s.matchId === 'm-locked-b')!;
    const lockedBEnd = new Date(lockedB.endAt);
    const newStart = new Date(newMatch.startAt);

    // Must wait for teamB (the later one) + rest
    expect(newStart.getTime()).toBeGreaterThanOrEqual(
      lockedBEnd.getTime() + 15 * 60_000
    );
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

describe('autoScheduleMatches · contraintes de disponibilité', () => {
  const HIN = 'hinode';
  const SHU = 'shujaa';

  /** « Hinode ne joue pas avant 21 h » — la contrainte qui a motivé le lot. */
  const pasAvant21h = {
    id: 'c1',
    teamId: HIN,
    tournamentId: null,
    kind: 'earliest' as const,
    timeOfDay: '21:00',
    timezone: 'Europe/Paris',
  };

  const match = makeMatch('m1', { team1Id: HIN, team2Id: SHU, format: 'bo3' });

  it('place le match au premier créneau AUTORISÉ, pas au premier libre', () => {
    const res = autoScheduleMatches([match], {
      // 2026-03-10 : heure d'hiver, Paris = UTC+1.
      windows: [makeDayWindow('2026-03-10', '18:00', '23:30')],
      estimatedDurationsMinutes: { bo3: 45 },
      slideWindowMinutes: 30,
      teamConstraints: [pasAvant21h],
    });
    expect(res.unscheduledMatchIds).toEqual([]);
    const start = new Date(res.scheduled[0].startAt);
    const heureParis = start.toLocaleTimeString('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(heureParis).toBe('21:00');
  });

  it('laisse le match NON planifié plutôt que de violer la contrainte', () => {
    // La fenêtre se ferme avant 21 h : aucun créneau légal. Poser le match
    // quand même produirait un planning que le diagnostic refuserait aussitôt.
    const res = autoScheduleMatches([match], {
      windows: [makeDayWindow('2026-03-10', '18:00', '20:30')],
      estimatedDurationsMinutes: { bo3: 45 },
      slideWindowMinutes: 30,
      teamConstraints: [pasAvant21h],
    });
    expect(res.scheduled).toEqual([]);
    expect(res.unscheduledMatchIds).toEqual(['m1']);
  });

  it('ignore une contrainte qui vise une autre équipe', () => {
    const res = autoScheduleMatches([match], {
      windows: [makeDayWindow('2026-03-10', '18:00', '20:30')],
      estimatedDurationsMinutes: { bo3: 45 },
      teamConstraints: [{ ...pasAvant21h, teamId: 'une-autre-equipe' }],
    });
    expect(res.unscheduledMatchIds).toEqual([]);
  });

  it('se comporte comme avant quand aucune contrainte n’est fournie', () => {
    const sans = autoScheduleMatches([match], {
      windows: [makeDayWindow('2026-03-10', '18:00', '23:30')],
      estimatedDurationsMinutes: { bo3: 45 },
    });
    const vide = autoScheduleMatches([match], {
      windows: [makeDayWindow('2026-03-10', '18:00', '23:30')],
      estimatedDurationsMinutes: { bo3: 45 },
      teamConstraints: [],
    });
    expect(vide.scheduled[0].startAt).toBe(sans.scheduled[0].startAt);
  });

  it('respecte un blackout de date en sautant la journée', () => {
    const res = autoScheduleMatches([match], {
      windows: [
        makeDayWindow('2026-03-10', '21:00', '23:30'),
        makeDayWindow('2026-03-11', '21:00', '23:30'),
      ],
      estimatedDurationsMinutes: { bo3: 45 },
      slideWindowMinutes: 30,
      teamConstraints: [
        {
          id: 'c2',
          teamId: SHU,
          tournamentId: null,
          kind: 'blackout' as const,
          startsOn: '2026-03-10',
          endsOn: '2026-03-10',
          timezone: 'Europe/Paris',
        },
      ],
    });
    expect(res.scheduled[0].startAt.slice(0, 10)).toBe('2026-03-11');
  });
});
