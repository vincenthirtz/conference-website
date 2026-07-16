import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

// logStaffAction hits the DB — stub it so the orchestration under test isn't
// coupled to the audit-log table shape.
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import quickBracketHandler from '../../pages/api/admin/quick-bracket';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function post(body: unknown) {
  const res = makeRes();
  return quickBracketHandler(makeReq({ body }), res).then(() => res);
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
});

const names = (n: number) =>
  Array.from({ length: n }, (_, i) => `Team ${i + 1}`);

function round1Matches() {
  return (store.matches as any[]).filter((m) => m.round_number === 1).slice();
}

function teamIdByName(name: string): string {
  const t = (store.teams as any[]).find((x) => x.name === name);
  return t?.id as string;
}

/* ===========================================================================
 * Happy path — single elim, power-of-two
 * =========================================================================*/

describe('POST /api/admin/quick-bracket — single elim, 8 participants', () => {
  it('creates 8 shell teams, 8 tournament_teams, 1 stage, 8 stage_teams, 7 matches seeded in order', async () => {
    const participants = names(8);
    const res = await post({
      name: 'My Cup',
      format: 'single_elim',
      participants,
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('tournamentId');
    expect(res.body).toHaveProperty('slug');

    // 8 shell teams (no roster, no captain).
    expect(store.teams as any[]).toHaveLength(8);
    for (const t of store.teams as any[]) {
      expect(t.captain_id).toBeNull();
      expect(t.is_active).toBe(true);
      expect(t.is_joinable).toBe(false);
    }

    // 1 tournament, published + public + format_type.
    expect(store.tournaments as any[]).toHaveLength(1);
    const tour = (store.tournaments as any[])[0];
    expect(tour.status).toBe('published');
    expect(tour.visibility).toBe('public');
    expect(tour.format_type).toBe('single_elim');
    expect(tour.game).toBeNull();

    // 8 tournament_teams (registered).
    expect(store.tournament_teams as any[]).toHaveLength(8);
    for (const tt of store.tournament_teams as any[]) {
      expect(tt.status).toBe('registered');
    }

    // 1 bracket stage.
    expect(store.tournament_stages as any[]).toHaveLength(1);
    expect((store.tournament_stages as any[])[0].stage_type).toBe('bracket');

    // 8 stage_teams with seed 1..8 in paste order.
    expect(store.stage_teams as any[]).toHaveLength(8);
    const seeds = (store.stage_teams as any[])
      .map((s) => s.seed)
      .sort((a, b) => a - b);
    expect(seeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Single elim size 8 => 4 + 2 + 1 = 7 matches.
    expect(store.matches as any[]).toHaveLength(7);
    const r1 = round1Matches();
    expect(r1).toHaveLength(4);

    // No byes when the field is full.
    expect((store.matches as any[]).filter((m) => m.is_bye)).toHaveLength(0);

    // Standard seeding order for 8 teams (ranks == paste order):
    //   m0: 1v8, m1: 4v5, m2: 2v7, m3: 3v6
    const p = participants;
    expect(r1[0].team1_id).toBe(teamIdByName(p[0])); // seed 1
    expect(r1[0].team2_id).toBe(teamIdByName(p[7])); // seed 8
    expect(r1[1].team1_id).toBe(teamIdByName(p[3])); // seed 4
    expect(r1[1].team2_id).toBe(teamIdByName(p[4])); // seed 5
    expect(r1[2].team1_id).toBe(teamIdByName(p[1])); // seed 2
    expect(r1[2].team2_id).toBe(teamIdByName(p[6])); // seed 7
    expect(r1[3].team1_id).toBe(teamIdByName(p[2])); // seed 3
    expect(r1[3].team2_id).toBe(teamIdByName(p[5])); // seed 6

    // Every shell team lands in a round-1 slot.
    const seatedIds = new Set<string>();
    for (const m of r1) {
      if (m.team1_id) seatedIds.add(m.team1_id);
      if (m.team2_id) seatedIds.add(m.team2_id);
    }
    expect(seatedIds.size).toBe(8);
  });
});

/* ===========================================================================
 * Non-power-of-two => byes
 * =========================================================================*/

describe('POST /api/admin/quick-bracket — 5 participants => size 8 with 3 byes', () => {
  it('rounds up to size 8 and marks 3 round-1 byes', async () => {
    const res = await post({
      name: 'Five Cup',
      format: 'single_elim',
      participants: names(5),
    });

    expect(res.statusCode).toBe(201);

    // 5 shell teams, 5 stage_teams.
    expect(store.teams as any[]).toHaveLength(5);
    expect(store.stage_teams as any[]).toHaveLength(5);

    // Size 8 bracket => 7 matches, 4 round-1 matches.
    expect(store.matches as any[]).toHaveLength(7);
    const r1 = round1Matches();
    expect(r1).toHaveLength(4);

    // 3 round-1 matches have exactly one team => 3 byes.
    const byes = r1.filter(
      (m) => !!m.team1_id !== !!m.team2_id // XOR
    );
    expect(byes).toHaveLength(3);
    // Those byes are recorded as finished byes.
    const recordedByes = (store.matches as any[]).filter(
      (m) => m.round_number === 1 && m.is_bye === true
    );
    expect(recordedByes).toHaveLength(3);
    for (const b of recordedByes) {
      expect(b.status).toBe('finished');
      expect(b.winner_team_id).toBeTruthy();
    }

    // Exactly one real (fully seeded) round-1 match.
    const realMatches = r1.filter((m) => !!m.team1_id && !!m.team2_id);
    expect(realMatches).toHaveLength(1);

    // stage settings carry the rounded-up size.
    expect((store.tournament_stages as any[])[0].settings.bracket_size).toBe(8);
  });
});

/* ===========================================================================
 * Double elimination
 * =========================================================================*/

describe('POST /api/admin/quick-bracket — double elim', () => {
  it('creates WB + LB + GF matches', async () => {
    const res = await post({
      name: 'DE Cup',
      format: 'double_elim',
      participants: names(4),
    });

    expect(res.statusCode).toBe(201);
    expect((store.tournaments as any[])[0].format_type).toBe('double_elim');

    const wb = (store.matches as any[]).filter((m) => m.bracket_side === 'wb');
    const lb = (store.matches as any[]).filter((m) => m.bracket_side === 'lb');
    const gf = (store.matches as any[]).filter(
      (m) => m.bracket_side === 'final'
    );

    // Size 4: WB = 2 + 1 = 3, LB = 2, GF = 1.
    expect(wb).toHaveLength(3);
    expect(lb).toHaveLength(2);
    expect(gf).toHaveLength(1);

    // Round-1 WB seeded from the 4 shell teams.
    const r1 = (store.matches as any[]).filter(
      (m) => m.round_number === 1 && m.bracket_side === 'wb'
    );
    expect(r1).toHaveLength(2);
    const seated = new Set<string>();
    for (const m of r1) {
      if (m.team1_id) seated.add(m.team1_id);
      if (m.team2_id) seated.add(m.team2_id);
    }
    expect(seated.size).toBe(4);
  });
});

/* ===========================================================================
 * Validation
 * =========================================================================*/

describe('POST /api/admin/quick-bracket — validation', () => {
  it('accepts a newline/comma-separated string for participants', async () => {
    const res = await post({
      name: 'String Cup',
      format: 'single_elim',
      participants: 'Alpha\nBravo, Charlie\nDelta',
    });
    expect(res.statusCode).toBe(201);
    expect(store.teams as any[]).toHaveLength(4);
  });

  it('400 on case-insensitive duplicates, naming the dupes', async () => {
    const res = await post({
      name: 'Dup Cup',
      format: 'single_elim',
      participants: ['Alpha', 'Bravo', 'alpha'],
    });
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/double/i);
    expect((res.body as any).error).toMatch(/Alpha/);
    // Nothing was created.
    expect(store.tournaments ?? []).toHaveLength(0);
    expect(store.teams ?? []).toHaveLength(0);
  });

  it('400 when fewer than 2 participants', async () => {
    const res = await post({
      name: 'Solo Cup',
      format: 'single_elim',
      participants: ['Alone'],
    });
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/entre 2 et 32/);
  });

  it('400 when more than 32 participants', async () => {
    const res = await post({
      name: 'Huge Cup',
      format: 'single_elim',
      participants: names(33),
    });
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/entre 2 et 32/);
  });

  it('400 on invalid format', async () => {
    const res = await post({
      name: 'Bad Cup',
      format: 'round_robin',
      participants: names(4),
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 on too-short name', async () => {
    const res = await post({
      name: 'x',
      format: 'single_elim',
      participants: names(4),
    });
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await quickBracketHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });
});
