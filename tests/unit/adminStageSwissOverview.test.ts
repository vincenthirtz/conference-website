// tests/unit/adminStageSwissOverview.test.ts — GET /api/admin/stages/[stageId]/swiss
// (écran d'une phase suisse) : ordre du classement repris du classement
// générique (disqualifiée en dernier, marquée), colonnes suisses calculées
// sur les matchs comptés, rondes groupées.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';
import handler from '../../pages/api/admin/stages/[stageId]/swiss';
import {
  buildSwissOverviewStandings,
  buildSwissRounds,
  type SwissOverviewMatch,
} from '../../features/admin/stages/service/swissOverview';

const TID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const T1 = '7a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const T2 = '8b2c3d4e-5f6a-4b7c-9d8e-9f0a1b2c3d4e';
const T3 = '9c3d4e5f-6a7b-4c8d-8e9f-0a1b2c3d4e5f';
const T4 = 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d';

const NAMES: Record<string, string> = {
  [T1]: 'Alpha',
  [T2]: 'Beta',
  [T3]: 'Gamma',
  [T4]: 'Delta',
};

function staffRow(role: StaffMember['role']): StaffMember {
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

let n = 0;
async function get(stageId = STAGE) {
  n += 1;
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  await handler(
    {
      method: 'GET',
      headers: { host: 'h', authorization: `Bearer s-${Date.now()}-${n}` },
      query: { stageId },
      body: {},
    } as any,
    res
  );
  return res;
}

function m(
  id: string,
  round: number,
  team1: string | null,
  team2: string | null,
  over: Record<string, unknown> = {}
): SwissOverviewMatch & Record<string, unknown> {
  return {
    id,
    tournament_id: TID,
    stage_id: STAGE,
    status: 'finished',
    is_bye: false,
    round_number: round,
    best_of: 3,
    scheduled_at: null,
    team1_id: team1,
    team2_id: team2,
    winner_team_id: team1,
    team1_score: 2,
    team2_score: 0,
    deleted_at: null,
    forfeit_team_id: null,
    group_key: null,
    ...over,
  };
}

function seed(dq: { team: string; mode: 'forfeit' | 'annul' } | null = null) {
  store.tournaments = [
    { id: TID, name: 'Coupe', slug: 'coupe', status: 'ongoing' },
  ] as any;
  store.tournament_stages = [
    {
      id: STAGE,
      tournament_id: TID,
      name: 'Suisse',
      stage_type: 'swiss',
      order_index: 0,
      is_active: true,
      settings: {},
    },
  ] as any;
  store.stage_teams = [T1, T2, T3, T4].map((id, i) => ({
    stage_id: STAGE,
    team_id: id,
    seed: i + 1,
    disqualified_at: dq?.team === id ? '2026-10-08T12:00:00Z' : null,
    disqualification_mode: dq?.team === id ? dq.mode : null,
    disqualification_reason: dq?.team === id ? 'triche' : null,
    disqualified_by: null,
    team: { id, name: NAMES[id], short_name: null, logo_url: null },
  })) as any;
  // R1 : T1 bat T2 2-0, T3 bat T4 2-1. R2 : T1 bat T3 2-1 ; T2 vs T4 à jouer.
  store.matches = [
    m('r1a', 1, T1, T2),
    m('r1b', 1, T3, T4, { team2_score: 1 }),
    m('r2a', 2, T1, T3, { team2_score: 1 }),
    m('r2b', 2, T2, T4, {
      status: 'pending',
      winner_team_id: null,
      team1_score: null,
      team2_score: null,
    }),
    m('gone', 2, T2, T3, { deleted_at: '2026-10-01T00:00:00Z' }),
  ] as any;
}

const row = (body: any, teamId: string) =>
  body.standings.find((s: any) => s.team_id === teamId);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateAllStandingsCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
});

describe('GET /api/admin/stages/[stageId]/swiss', () => {
  it('classement, colonnes suisses et rondes', async () => {
    seed();
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.body.stage).toEqual({
      id: STAGE,
      name: 'Suisse',
      stage_type: 'swiss',
    });
    expect(res.body.tournament).toMatchObject({ id: TID, slug: 'coupe' });

    expect(res.body.standings[0].team_id).toBe(T1);
    expect(res.body.standings.map((s: any) => s.rank)).toEqual([1, 2, 3, 4]);
    expect(row(res.body, T1)).toMatchObject({
      team: { id: T1, name: 'Alpha' },
      wins: 2,
      losses: 0,
      games_won: 4,
      games_lost: 1,
      match_count: 2,
    });
    expect(row(res.body, T1).disqualified).toBeUndefined();
    // Adversaires de T1 : T2 (0 V / 1 D) et T3 (1 V / 1 D).
    expect(row(res.body, T1).opp_winrate).toBeCloseTo(0.25);

    // Rondes croissantes, match supprimé absent, équipes jointes.
    expect(res.body.rounds.map((r: any) => r.round_number)).toEqual([1, 2]);
    expect(res.body.rounds[1].matches.map((x: any) => x.id).sort()).toEqual([
      'r2a',
      'r2b',
    ]);
    expect(res.body.rounds[0].matches[0].team1).toMatchObject({
      name: 'Alpha',
    });
  });

  it('disqualifiée (forfeit) : classée en dernier et marquée', async () => {
    seed({ team: T1, mode: 'forfeit' });
    const res = await get();
    expect(res.statusCode).toBe(200);
    const last = res.body.standings.at(-1);
    expect(last).toMatchObject({
      team_id: T1,
      rank: 4,
      disqualified: true,
      disqualificationMode: 'forfeit',
      // Ses matchs comptent en mode forfeit.
      wins: 2,
    });
    expect(res.body.standings.filter((s: any) => s.disqualified)).toHaveLength(
      1
    );
  });

  it('disqualifiée (annul) : ses matchs sortent des colonnes de tous', async () => {
    seed({ team: T1, mode: 'annul' });
    const res = await get();
    const t1 = row(res.body, T1);
    expect(t1).toMatchObject({
      rank: 4,
      disqualified: true,
      disqualificationMode: 'annul',
      match_count: 0,
      games_won: 0,
    });
    expect(row(res.body, T3)).toMatchObject({
      games_won: 2,
      games_lost: 1,
      match_count: 1,
    });
  });

  it('400 hors phase suisse, 404 phase inconnue, 403 sans rôle staff', async () => {
    seed();
    (store.tournament_stages as any[])[0].stage_type = 'round_robin';
    expect((await get()).statusCode).toBe(400);
    expect((await get('00000000-0000-4000-8000-000000000000')).statusCode).toBe(
      404
    );
    // Sans compte staff : refusé avant toute lecture.
    store.staff = [] as any;
    invalidateStaffCache();
    expect([401, 403]).toContain((await get()).statusCode);
  });
});

describe('buildSwissOverviewStandings / buildSwissRounds (purs)', () => {
  it('BYE : compté en match, ni manches ni adversaire', () => {
    const teams = new Map([
      [T1, { id: T1, name: 'Alpha', short_name: null, logo_url: null }],
    ]);
    const out = buildSwissOverviewStandings(
      [
        {
          teamId: T1,
          teamName: 'Alpha',
          rank: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          score: 3,
          seed: 1,
        },
      ],
      [m('bye', 1, T1, null, { is_bye: true, team1_score: 1 })],
      teams,
      new Map()
    );
    expect(out[0]).toMatchObject({
      match_count: 1,
      games_won: 0,
      buchholz: null,
      opp_winrate: null,
    });
  });

  it('rondes sans numéro regroupées en 0, triées', () => {
    const rounds = buildSwissRounds(
      [m('b', 2, T1, T2), m('a', 1, T1, T2), m('z', 0, T1, T2)].map((x) =>
        x.id === 'z' ? { ...x, round_number: null } : x
      ),
      new Map()
    );
    expect(rounds.map((r) => r.round_number)).toEqual([0, 1, 2]);
  });
});
