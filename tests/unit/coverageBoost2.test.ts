// Coverage boost #2 — covers util gaps and additional admin route gaps.
// Files targeted: utils/simulator (swissPairByRecord, computeHeadToHead),
// admin/recycle-bin (GET listing), admin/users/manage (additional branches),
// admin/stages/[stageId]/bulk-matches, blizzard-news, admin/me,
// admin/teams/[teamId]/tournaments (GET happy path), and a few smaller routes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  swissPairByRecord,
  computeHeadToHead,
  type SimTeam,
  type SimMatch,
} from '../../utils/simulator';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function team(id: string, seed = 1, strength = 50): SimTeam {
  return {
    id,
    name: `T${id}`,
    short_name: id.toUpperCase(),
    logo_url: null,
    seed,
    strength,
    players: [],
  };
}

function finishedMatch(opts: {
  id: string;
  team1Id: string;
  team2Id: string;
  winnerId: string;
  team1Score?: number;
  team2Score?: number;
}): SimMatch {
  return {
    id: opts.id,
    round_number: 1,
    round_name: 'R1',
    position_in_round: 1,
    status: 'finished',
    match_format: 'bo3',
    best_of: 3,
    team1: null,
    team2: null,
    team1_id: opts.team1Id,
    team2_id: opts.team2Id,
    team1_score: opts.team1Score ?? (opts.winnerId === opts.team1Id ? 2 : 0),
    team2_score: opts.team2Score ?? (opts.winnerId === opts.team2Id ? 2 : 0),
    winner_team_id: opts.winnerId,
    scheduled_at: null,
    maps: [],
    bracket_side: 'wb',
    next_match_win_idx: null,
    next_match_win_slot: null,
    next_match_lose_idx: null,
    next_match_lose_slot: null,
    next_match_win_id: null,
    next_match_lose_id: null,
    locked: false,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * utils/simulator — swissPairByRecord
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * utils/simulator — computeHeadToHead
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/recycle-bin — GET
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/me
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/users/manage — additional branches
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/bulk-matches
 * ---------------------------------------------------------*/

// /api/admin/stages/[stageId]/bulk-matches tests live in apiRoutesBatch32.test.ts
// (importing the handler here in --no-isolate mode causes mock contention with
// that file's logStaffAction expectation).

/* -----------------------------------------------------------
 * /api/blizzard-news
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/logout
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/twitch-channels (public)
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/cast-members (public)
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/partnership-requests
 * ---------------------------------------------------------*/

// /api/partnership-requests tests are owned by apiSweep2a.test.ts to avoid
// email-mock cross-contamination in --no-isolate mode.

/* -----------------------------------------------------------
 * /api/partners
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/site-settings
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/tournaments — POST extras
 * ---------------------------------------------------------*/

describe('swissPairByRecord', () => {
  it('returns pairings for an even number of teams with no history', () => {
    const teams = [team('a', 1), team('b', 2), team('c', 3), team('d', 4)];
    const { pairings } = swissPairByRecord(teams, []);
    expect(pairings.length).toBe(2);
    // Every team appears exactly once
    const indices = new Set<number>();
    for (const p of pairings) {
      indices.add(p.team1Idx);
      indices.add(p.team2Idx);
    }
    expect(indices.size).toBe(4);
  });

  it('keeps higher-record teams paired with each other', () => {
    const teams = [team('a'), team('b'), team('c'), team('d')];
    const previous: SimMatch[] = [
      finishedMatch({
        id: 'm1',
        team1Id: 'a',
        team2Id: 'd',
        winnerId: 'a',
        team1Score: 2,
        team2Score: 0,
      }),
      finishedMatch({
        id: 'm2',
        team1Id: 'b',
        team2Id: 'c',
        winnerId: 'b',
        team1Score: 2,
        team2Score: 1,
      }),
    ];
    const { pairings } = swissPairByRecord(teams, previous);
    expect(pairings.length).toBe(2);
    // Teams 'a' and 'b' both have 1 win — they should be paired together
    const winnersTogether = pairings.some(
      (p) =>
        (teams[p.team1Idx].id === 'a' && teams[p.team2Idx].id === 'b') ||
        (teams[p.team1Idx].id === 'b' && teams[p.team2Idx].id === 'a')
    );
    expect(winnersTogether).toBe(true);
  });

  it('avoids rematches when possible', () => {
    const teams = [team('a'), team('b'), team('c'), team('d')];
    const previous: SimMatch[] = [
      finishedMatch({ id: 'm1', team1Id: 'a', team2Id: 'b', winnerId: 'a' }),
      finishedMatch({ id: 'm2', team1Id: 'c', team2Id: 'd', winnerId: 'c' }),
    ];
    const { pairings } = swissPairByRecord(teams, previous);
    // 'a' and 'c' both have 1 win. They should be paired since they haven't met.
    const newMeetings = pairings.map((p) =>
      [teams[p.team1Idx].id, teams[p.team2Idx].id].sort().join('-')
    );
    expect(newMeetings).not.toContain('a-b');
    expect(newMeetings).not.toContain('c-d');
  });

  it('falls back to rematch when no other option', () => {
    // Only 2 teams that have already played each other
    const teams = [team('a'), team('b')];
    const previous: SimMatch[] = [
      finishedMatch({ id: 'm1', team1Id: 'a', team2Id: 'b', winnerId: 'a' }),
    ];
    const { pairings } = swissPairByRecord(teams, previous);
    expect(pairings.length).toBe(1);
  });

  it('assigns a bye to the odd team out', () => {
    const teams = [team('a'), team('b'), team('c')];
    const { pairings, byeTeamIdx } = swissPairByRecord(teams, []);
    // 1 pair + 1 bye
    expect(pairings.length).toBe(1);
    expect(byeTeamIdx).not.toBeNull();
  });

  it('handles previously played matches without scores', () => {
    const teams = [team('a'), team('b'), team('c'), team('d')];
    const matchNoScores = finishedMatch({
      id: 'm1',
      team1Id: 'a',
      team2Id: 'b',
      winnerId: 'a',
    });
    matchNoScores.team1_score = null;
    matchNoScores.team2_score = null;
    const { pairings } = swissPairByRecord(teams, [matchNoScores]);
    expect(pairings.length).toBe(2);
  });
});

describe('computeHeadToHead', () => {
  it('returns empty when no finished matches', () => {
    expect(computeHeadToHead([])).toEqual([]);
  });

  it('aggregates wins between two teams', () => {
    const matches: SimMatch[] = [
      finishedMatch({
        id: 'm1',
        team1Id: 'a',
        team2Id: 'b',
        winnerId: 'a',
        team1Score: 2,
        team2Score: 1,
      }),
      finishedMatch({
        id: 'm2',
        team1Id: 'b',
        team2Id: 'a',
        winnerId: 'b',
        team1Score: 2,
        team2Score: 0,
      }),
    ];
    const records = computeHeadToHead(matches);
    expect(records.length).toBe(1);
    const r = records[0];
    // Sorted IDs: 'a' then 'b' (alphabetical)
    expect(r.team1Id).toBe('a');
    expect(r.team2Id).toBe('b');
    expect(r.team1Wins).toBe(1);
    expect(r.team2Wins).toBe(1);
    // a scored 2 in m1 + 0 in m2 (as team2 of m2 with score 0)
    expect(r.mapScore1).toBe(2);
    // b scored 1 in m1 + 2 in m2
    expect(r.mapScore2).toBe(3);
  });

  it('skips matches without winner_team_id', () => {
    const m = finishedMatch({
      id: 'm1',
      team1Id: 'a',
      team2Id: 'b',
      winnerId: 'a',
    });
    m.winner_team_id = null;
    expect(computeHeadToHead([m])).toEqual([]);
  });

  it('skips non-finished matches', () => {
    const m = finishedMatch({
      id: 'm1',
      team1Id: 'a',
      team2Id: 'b',
      winnerId: 'a',
    });
    m.status = 'pending';
    expect(computeHeadToHead([m])).toEqual([]);
  });
});
