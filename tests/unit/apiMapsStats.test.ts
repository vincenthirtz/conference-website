import { describe, it, expect, vi, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/maps/stats';

const TID = '550e8400-e29b-41d4-a716-446655440000';

function makeReq(query: Record<string, any> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h' },
    query,
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

beforeEach(() => {
  resetSupabaseMock();
});

describe('GET /api/maps/stats — guards', () => {
  it('returns 405 on non-GET methods', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }, 'POST'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when tournamentId is missing', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when tournamentId is not a UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: 'nope' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when tournamentId is an array', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: [TID, TID] }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/maps/stats — empty tournament', () => {
  it('returns an empty payload when no matches exist for the tournament', async () => {
    store.matches = [];
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      tournamentId: TID,
      totalGames: 0,
      totalVetoMatches: 0,
      maps: [],
      neverPlayed: [],
      teamTendencies: [],
    });
  });

  it('treats BYE matches as if they were absent', async () => {
    store.matches = [
      {
        id: 'm-bye',
        tournament_id: TID,
        status: 'finished',
        is_bye: true,
        team1_id: 't1',
        team2_id: null,
        winner_team_id: 't1',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    expect((res.body as any).totalGames).toBe(0);
  });
});

describe('GET /api/maps/stats — full response', () => {
  beforeEach(() => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
      },
      {
        id: 'm2',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't2',
      },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
    store.games = [
      {
        match_id: 'm1',
        map_name: 'Lijiang',
        team1_score: 3,
        team2_score: 1,
        winner_team_id: 't1',
        duration_minutes: 12,
        is_tiebreaker: false,
        went_overtime: false,
      },
      {
        match_id: 'm1',
        map_name: 'Hanamura',
        team1_score: 2,
        team2_score: 3,
        winner_team_id: 't2',
        duration_minutes: 18,
        is_tiebreaker: false,
        went_overtime: true,
      },
      {
        match_id: 'm2',
        map_name: 'Lijiang',
        team1_score: 1,
        team2_score: 3,
        winner_team_id: 't2',
        duration_minutes: 14,
        is_tiebreaker: true,
        went_overtime: false,
      },
    ] as any;
    store.match_map_vetos = [
      { match_id: 'm1', action: 'ban', team_id: 't1', map_name: 'Eichenwalde' },
      { match_id: 'm1', action: 'pick', team_id: 't2', map_name: 'Lijiang' },
      {
        match_id: 'm1',
        action: 'decider',
        team_id: null,
        map_name: 'Hanamura',
      },
      { match_id: 'm2', action: 'ban', team_id: 't1', map_name: 'Numbani' },
      { match_id: 'm2', action: 'pick', team_id: 't2', map_name: 'Lijiang' },
    ] as any;
    store.tournament_maps = [
      { tournament_id: TID, map_name: 'Lijiang', enabled: true },
      { tournament_id: TID, map_name: 'Hanamura', enabled: true },
      { tournament_id: TID, map_name: 'Oasis', enabled: true }, // never played
      { tournament_id: TID, map_name: 'Disabled', enabled: false }, // ignored
    ] as any;
  });

  it('aggregates totals correctly', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const body = res.body as any;

    expect(body.totalGames).toBe(3);
    expect(body.totalVetoMatches).toBe(2); // m1 + m2 each have vetos
    expect(body.maps.length).toBeGreaterThan(0);
  });

  it('orders maps by gamesPlayed desc', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const maps = (res.body as any).maps as {
      mapName: string;
      gamesPlayed: number;
    }[];
    // Lijiang has 2 games, Hanamura 1
    expect(maps[0].mapName).toBe('Lijiang');
    expect(maps[0].gamesPlayed).toBe(2);
  });

  it('reports overtimes and tiebreakers per map', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const maps = (res.body as any).maps as any[];
    const lijiang = maps.find((m) => m.mapName === 'Lijiang');
    const hanamura = maps.find((m) => m.mapName === 'Hanamura');
    expect(lijiang.tiebreakers).toBe(1);
    expect(hanamura.overtimes).toBe(1);
  });

  it('computes per-team winrates on each map', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const maps = (res.body as any).maps as any[];
    const lijiang = maps.find((m) => m.mapName === 'Lijiang');

    // On Lijiang: t1 won game 1, t2 won game 2 -> 1W/1L each
    const t1 = lijiang.teamWinrates.find((t: any) => t.teamId === 't1');
    const t2 = lijiang.teamWinrates.find((t: any) => t.teamId === 't2');
    expect(t1.wins).toBe(1);
    expect(t1.losses).toBe(1);
    expect(t1.winrate).toBe(0.5);
    expect(t2.wins).toBe(1);
    expect(t2.losses).toBe(1);
  });

  it('lists never-played maps from the active tournament pool', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const np = (res.body as any).neverPlayed as string[];
    // Oasis is in the active pool but no game references it
    // (Eichenwalde and Numbani appear in vetos so they're returned in `maps`).
    expect(np).toContain('Oasis');
    expect(np).not.toContain('Disabled'); // disabled pool entry skipped
    expect(np).not.toContain('Lijiang');
  });

  it('aggregates ban/pick tendencies per team', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    const tend = (res.body as any).teamTendencies as any[];

    const t1 = tend.find((t) => t.teamId === 't1');
    const t2 = tend.find((t) => t.teamId === 't2');
    expect(t1.bans.map((b: any) => b.mapName).sort()).toEqual([
      'Eichenwalde',
      'Numbani',
    ]);
    expect(t2.picks.map((p: any) => p.mapName)).toEqual(['Lijiang']);
    // t2 picked Lijiang twice
    expect(t2.picks[0].count).toBe(2);
  });

  it('respects minGames filter', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID, minGames: '2' }), res);
    const maps = (res.body as any).maps as any[];
    // Only Lijiang has 2 games — Hanamura (1 game) gets filtered out
    expect(maps.length).toBeGreaterThan(0);
    for (const m of maps) {
      // The veto-only maps (Eichenwalde, Numbani) have gamesPlayed=0 so they
      // are filtered too. Every returned map must have >=2 games.
      expect(m.gamesPlayed).toBeGreaterThanOrEqual(2);
    }
  });

  it('respects the limit parameter', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID, limit: '1' }), res);
    expect((res.body as any).maps).toHaveLength(1);
  });

  it('sets a public Cache-Control header on success', async () => {
    const res = makeRes();
    await handler(makeReq({ tournamentId: TID }), res);
    expect(res.headers['Cache-Control']).toContain('public');
  });
});
