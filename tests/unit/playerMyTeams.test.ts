// GET /api/player/my-teams — console multi-équipes (lot J4).
//
// Ce que ces tests protègent :
//  1. UNE ligne par équipe encadrée — la console ne connaît pas le sélecteur ;
//  2. le prochain match est celui de CHAQUE équipe (pas le premier tout court) ;
//  3. le check-in et la feuille sont lus du bon côté du match.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/player/my-teams';

const USER = '11111111-1111-1111-1111-111111111111';
const TEAM_A = '22222222-2222-2222-2222-222222222222';
const TEAM_B = '33333333-3333-3333-3333-333333333333';
const OPP = '44444444-4444-4444-4444-444444444444';

let _t = 0;
function makeReq(over: Partial<any> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    query: {},
    body: {},
    ...over,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const soon = new Date(Date.now() + 20 * 60_000).toISOString();
const later = new Date(Date.now() + 5 * 60 * 60_000).toISOString();

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });

  store.teams = [
    {
      id: TEAM_A,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Phenix',
      slug: 'phenix',
      logo_url: null,
      captain_id: USER,
      is_active: true,
    },
    {
      id: TEAM_B,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Secondes',
      slug: 'secondes',
      logo_url: null,
      captain_id: null,
      is_active: true,
    },
    {
      id: OPP,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Avoidgers',
      captain_id: null,
      is_active: true,
    },
  ] as any;

  store.team_members = [
    {
      id: 'tm-a',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_A,
      user_id: USER,
      role: 'player',
    },
    {
      id: 'tm-b',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_B,
      user_id: USER,
      role: 'manager',
    },
    {
      id: 'tm-b2',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_B,
      user_id: 'someone',
      role: 'player',
    },
  ] as any;

  store.matches = [
    {
      id: 'm-a',
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'pending',
      scheduled_at: soon,
      team1_id: TEAM_A,
      team2_id: OPP,
      team1_checked_in_at: new Date().toISOString(),
      team2_checked_in_at: null,
      team1: { id: TEAM_A, name: 'Phenix' },
      team2: { id: OPP, name: 'Avoidgers' },
      tournament: { min_players: 5 },
    },
    {
      id: 'm-b',
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'pending',
      scheduled_at: later,
      team1_id: OPP,
      team2_id: TEAM_B,
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      team1: { id: OPP, name: 'Avoidgers' },
      team2: { id: TEAM_B, name: 'Secondes' },
      tournament: { min_players: null },
    },
  ] as any;

  store.match_lineups = [] as any;
  store.demandes = [] as any;
});

describe('/api/player/my-teams', () => {
  it('rend une ligne par équipe encadrée', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    expect(teams).toHaveLength(2);
    expect(teams.map((r: any) => r.team.id).sort()).toEqual(
      [TEAM_A, TEAM_B].sort()
    );
  });

  it('donne à CHAQUE équipe son propre prochain match', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const byId = Object.fromEntries(
      (res.body as any).teams.map((r: any) => [r.team.id, r])
    );

    expect(byId[TEAM_A].nextMatch.id).toBe('m-a');
    expect(byId[TEAM_B].nextMatch.id).toBe('m-b');
  });

  it('lit le check-in du bon côté du match', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const byId = Object.fromEntries(
      (res.body as any).teams.map((r: any) => [r.team.id, r])
    );

    // TEAM_A est team1 et a checké ; TEAM_B est team2 et n'a pas checké.
    expect(byId[TEAM_A].nextMatch.checkedIn).toBe(true);
    expect(byId[TEAM_B].nextMatch.checkedIn).toBe(false);
    expect(byId[TEAM_A].nextMatch.opponentName).toBe('Avoidgers');
    expect(byId[TEAM_B].nextMatch.opponentName).toBe('Avoidgers');
  });

  it('signale un effectif sous le minimum du tournoi', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const a = (res.body as any).teams.find((r: any) => r.team.id === TEAM_A);
    // 1 membre pour un minimum de 5.
    expect(a.roster).toEqual({ size: 1, minPlayers: 5, shortfall: 4 });
  });

  it('compte les demandes en attente par équipe', async () => {
    store.demandes = [
      {
        id: 'd-1',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_B,
        type: 'join',
        status: 'pending',
      },
      {
        id: 'd-2',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_B,
        type: 'join',
        status: 'approved',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    const byId = Object.fromEntries(
      (res.body as any).teams.map((r: any) => [r.team.id, r])
    );
    expect(byId[TEAM_B].pendingJoinRequests).toBe(1);
    expect(byId[TEAM_A].pendingJoinRequests).toBe(0);
  });

  it('remonte la feuille validée pour la bonne équipe', async () => {
    store.match_lineups = [
      { match_id: 'm-a', team_id: TEAM_A, status: 'validated' },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    const byId = Object.fromEntries(
      (res.body as any).teams.map((r: any) => [r.team.id, r])
    );
    expect(byId[TEAM_A].nextMatch.lineupValidated).toBe(true);
    expect(byId[TEAM_B].nextMatch.lineupValidated).toBe(false);
  });

  it('rend une liste vide pour qui n’encadre rien', async () => {
    store.teams = (store.teams as any[]).map((t) => ({
      ...t,
      captain_id: null,
    }));
    store.team_members = [
      {
        id: 'tm-x',
        tenant_id: CONFERENCE_TENANT_ID,
        team_id: TEAM_A,
        user_id: USER,
        role: 'player',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).teams).toEqual([]);
  });

  it('refuse POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
