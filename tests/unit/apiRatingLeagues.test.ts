// tests/unit/apiRatingLeagues.test.ts
//
// Tests d'API légers pour la feature rating + leagues :
//   - GET  /api/players/leaderboard        → {players:[]} si vide ; tri + rank
//   - GET  /api/players/[userId]/profile   → 404 si joueur inconnu
//   - POST /api/admin/leagues/[id]/recompute → standings triés (2 tournois)
//
// Supabase + rateLimit sont mockés globalement (tests/unit/__helpers__/testSetup.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import leaderboardHandler from '../../pages/api/players/leaderboard';
import profileHandler from '../../pages/api/players/[userId]/profile';
import recomputeHandler from '../../pages/api/admin/leagues/[id]/recompute';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_USER_ID = 'staff-user-1';
const LEAGUE_ID = '11111111-1111-1111-1111-111111111111';
const T1 = '22222222-2222-2222-2222-222222222222';
const T2 = '33333333-3333-3333-3333-333333333333';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    cookies: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    ended: false,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => ((res.ended = true), res);
  return res;
}

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_USER_ID,
    email: 'a@a.com',
    role: 'admin',
    display_name: 'Manager',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * GET /api/players/leaderboard
 * ===========================================================================*/

describe('GET /api/players/leaderboard', () => {
  it('returns {players:[]} when no player_ratings exist', async () => {
    store.player_ratings = [];
    const res = makeRes();
    await leaderboardHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ players: [] });
  });

  it('sorts by rating desc and assigns rank', async () => {
    store.player_ratings = [
      {
        tenant_id: TENANT,
        user_id: 'u-low',
        rating: 1400,
        rd: 100,
        games_played: 3,
        wins: 1,
        losses: 2,
        display_name: 'Low',
        battle_tag: 'Low#1',
        avatar_url: null,
      },
      {
        tenant_id: TENANT,
        user_id: 'u-high',
        rating: 1700,
        rd: 80,
        games_played: 5,
        wins: 4,
        losses: 1,
        display_name: 'High',
        battle_tag: 'High#1',
        avatar_url: null,
      },
      // games_played = 0 → exclu.
      {
        tenant_id: TENANT,
        user_id: 'u-zero',
        rating: 9999,
        rd: 50,
        games_played: 0,
        wins: 0,
        losses: 0,
        display_name: 'Zero',
        battle_tag: null,
        avatar_url: null,
      },
    ] as any;

    const res = makeRes();
    await leaderboardHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const players = (res.body as any).players;
    expect(players).toHaveLength(2);
    expect(players[0].userId).toBe('u-high');
    expect(players[0].rank).toBe(1);
    expect(players[1].userId).toBe('u-low');
    expect(players[1].rank).toBe(2);
  });
});

/* ===========================================================================
 * GET /api/players/[userId]/profile
 * ===========================================================================*/

describe('GET /api/players/[userId]/profile', () => {
  it('returns 404 when the player has no player_ratings', async () => {
    store.player_ratings = [];
    const res = makeRes();
    await profileHandler(makeReq({ query: { userId: 'ghost' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the profile core when the player exists', async () => {
    store.player_ratings = [
      {
        tenant_id: TENANT,
        user_id: 'u-1',
        rating: 1600,
        rd: 90,
        volatility: 0.06,
        peak_rating: 1650,
        games_played: 4,
        wins: 3,
        losses: 1,
        display_name: 'Alice',
        battle_tag: 'Alice#1',
        avatar_url: null,
      },
    ] as any;
    store.player_rating_history = [];
    store.match_participants = [];
    const res = makeRes();
    await profileHandler(makeReq({ query: { userId: 'u-1' } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.player.userId).toBe('u-1');
    expect(body.player.rank).toBe(1);
    expect(body.history).toEqual([]);
    expect(body.recentMatches).toEqual([]);
    expect(body.h2h).toEqual([]);
    // achievements est toujours présent : pas de palmarès/saison ici, mais le
    // peak_rating 1650 dérive un badge peak_contender (moteur pur).
    expect(body.achievements).toBeDefined();
    expect(body.achievements.palmares).toEqual([]);
    expect(body.achievements.seasons).toEqual([]);
    expect(body.achievements.badges.map((b: any) => b.key)).toContain(
      'peak_contender'
    );
  });

  it('exposes a champion badge for a tournament winner', async () => {
    const MATCH = 'match-champ-1';
    const TOURN = '44444444-4444-4444-4444-444444444444';
    const TEAM = 'team-champ';

    store.player_ratings = [
      {
        tenant_id: TENANT,
        user_id: 'u-champ',
        rating: 1700,
        rd: 80,
        volatility: 0.06,
        peak_rating: 1750,
        games_played: 5,
        wins: 4,
        losses: 1,
        display_name: 'Champ',
        battle_tag: 'Champ#1',
        avatar_url: null,
      },
    ] as any;
    store.player_rating_history = [];
    // Participation du joueur → (TOURN, TEAM) via le match.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        team_id: TEAM,
        user_id: 'u-champ',
        battle_tag: 'Champ#1',
        is_substitute: false,
      },
    ] as any;
    store.matches = [
      {
        tenant_id: TENANT,
        id: MATCH,
        tournament_id: TOURN,
        team1_id: TEAM,
        team2_id: 'team-other',
        winner_team_id: TEAM,
        completed_at: '2026-06-01T10:00:00.000Z',
      },
    ] as any;
    // final_rankings : l'équipe du joueur est 1re → badge champion.
    store.final_rankings = [
      { tenant_id: TENANT, tournament_id: TOURN, team_id: TEAM, rank: 1 },
    ] as any;
    store.tournaments = [
      {
        tenant_id: TENANT,
        id: TOURN,
        name: 'Grand Open',
        slug: 'grand-open',
        start_date: '2026-05-30',
        end_date: '2026-06-01',
      },
    ] as any;
    store.teams = [{ tenant_id: TENANT, id: TEAM, name: 'Les Championnes' }] as any;
    store.league_standings = [];

    const res = makeRes();
    await profileHandler(makeReq({ query: { userId: 'u-champ' } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    const badgeKeys = body.achievements.badges.map((b: any) => b.key);
    expect(badgeKeys).toContain('champion');
    // Le palmarès reflète le placement rank 1.
    expect(body.achievements.palmares).toHaveLength(1);
    expect(body.achievements.palmares[0].rank).toBe(1);
    expect(body.achievements.palmares[0].tournamentName).toBe('Grand Open');
    expect(body.achievements.palmares[0].teamName).toBe('Les Championnes');
  });
});

/* ===========================================================================
 * POST /api/admin/leagues/[id]/recompute
 * ===========================================================================*/

describe('POST /api/admin/leagues/[id]/recompute', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_USER_ID });
    store.staff = [makeStaffRow()] as any;
    store.tenants = [
      { id: TENANT, slug: 'conference', name: 'Conf', is_active: true },
    ] as any;
    store.tenant_staff = [
      { tenant_id: TENANT, staff_id: 'staff-1', role: 'manager' },
    ] as any;
  });

  it('computes sorted standings over 2 linked tournaments', async () => {
    store.leagues = [
      {
        id: LEAGUE_ID,
        tenant_id: TENANT,
        slug: 'season-1',
        status: 'active',
        is_public: true,
        // 1er = 10 pts, 2e = 6 pts.
        points_table: { '1': 10, '2': 6 },
      },
    ] as any;
    store.league_tournaments = [
      { league_id: LEAGUE_ID, tournament_id: T1, tenant_id: TENANT, weight: 1 },
      { league_id: LEAGUE_ID, tournament_id: T2, tenant_id: TENANT, weight: 2 },
    ] as any;
    // final_rankings :
    //  - team A : rank 1 sur T1 (10*1=10) + rank 2 sur T2 (6*2=12) = 22
    //  - team B : rank 2 sur T1 (6*1=6)  + rank 1 sur T2 (10*2=20) = 26
    store.final_rankings = [
      { tenant_id: TENANT, tournament_id: T1, team_id: 'team-A', rank: 1 },
      { tenant_id: TENANT, tournament_id: T1, team_id: 'team-B', rank: 2 },
      { tenant_id: TENANT, tournament_id: T2, team_id: 'team-A', rank: 2 },
      { tenant_id: TENANT, tournament_id: T2, team_id: 'team-B', rank: 1 },
    ] as any;
    store.league_standings = [];

    const res = makeRes();
    await recomputeHandler(
      makeReq({
        method: 'POST',
        query: { id: LEAGUE_ID },
        headers: { host: 'h', authorization: 'Bearer t-1' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).standings_count).toBe(2);

    const standings = (store.league_standings as any[]).sort(
      (a, b) => a.rank - b.rank
    );
    expect(standings).toHaveLength(2);
    // team-B (26 pts) devant team-A (22 pts).
    expect(standings[0].team_id).toBe('team-B');
    expect(standings[0].points).toBe(26);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].team_id).toBe('team-A');
    expect(standings[1].points).toBe(22);
    expect(standings[1].rank).toBe(2);
  });

  it('returns 404 for an unknown league', async () => {
    store.leagues = [];
    const res = makeRes();
    await recomputeHandler(
      makeReq({
        method: 'POST',
        query: { id: LEAGUE_ID },
        headers: { host: 'h', authorization: 'Bearer t-2' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
