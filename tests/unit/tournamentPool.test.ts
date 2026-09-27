// Tests pour l'inscription individuelle regroupée en équipes de 5 :
//   - pages/api/tournament/[id]/pool.ts (GET / POST / DELETE)
//   - utils/tournaments/pool.ts (équipes de la joueuse, avancement)
//   - utils/tournaments/registerHref.ts (porte d'entrée)
//
// Le seuil « 5 d'une même équipe » vit dans la fonction SQL `pool_register`,
// simulée ici : on vérifie que la route l'appelle avec les bons paramètres et
// qu'elle refuse ce qui ne doit jamais l'atteindre (équipe d'une autre,
// tournoi privé ou fermé).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
  setAuthUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/tournament/[id]/pool';
import { listPlayerTeams } from '../../utils/tournaments/pool';
import { tournamentRegisterHref } from '../../utils/tournaments/registerHref';

const T_ID = '4313f067-b7a4-4872-a8b7-5035d0596d2e';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'user-1';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: { id: T_ID },
    body: {},
    socket: { remoteAddress: `10.2.0.${n % 250}` },
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

function tournament(over: Record<string, unknown> = {}) {
  return {
    id: T_ID,
    tenant_id: CONFERENCE_TENANT_ID,
    status: 'published',
    visibility: 'public',
    pooled_teams: true,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER, email: 'a@a.test', user_metadata: {} });
  store.tournaments = [tournament()] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      deleted_at: null,
      is_active: true,
    },
    {
      id: TEAM_B,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Bravo',
      deleted_at: null,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      tenant_id: CONFERENCE_TENANT_ID,
      user_id: USER,
      team_id: TEAM_A,
      role: 'player',
    },
    // Coach de Bravo : n'y joue pas, ne peut pas la déclarer.
    {
      tenant_id: CONFERENCE_TENANT_ID,
      user_id: USER,
      team_id: TEAM_B,
      role: 'coach',
    },
  ] as any;
  store.tournament_pool_entries = [] as any;
  store.tournament_teams = [] as any;
});

const validBody = {
  displayName: 'Mercy',
  battleTag: 'Mercy#1234',
  originTeamId: TEAM_A,
};

describe('listPlayerTeams', () => {
  it('lists only teams she plays for, never as coach/manager', async () => {
    expect(await listPlayerTeams(CONFERENCE_TENANT_ID, USER)).toEqual([
      { id: TEAM_A, name: 'Alpha' },
    ]);
  });

  it('skips deleted or inactive teams', async () => {
    (store.teams as any[])[0].deleted_at = '2026-01-01T00:00:00Z';
    expect(await listPlayerTeams(CONFERENCE_TENANT_ID, USER)).toEqual([]);
  });
});

describe('tournamentRegisterHref', () => {
  it('sends a pooled tournament to the individual form', () => {
    expect(tournamentRegisterHref({ id: 'x', pooled_teams: true })).toBe(
      '/tournament/x/inscription-solo'
    );
    expect(tournamentRegisterHref({ id: 'x' })).toBe(
      '/team/create?tournament=x'
    );
  });
});

describe('/api/tournament/[id]/pool — guards', () => {
  it('401 without a token', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('404 on a private or non-pooled tournament', async () => {
    store.tournaments = [tournament({ visibility: 'private' })] as any;
    const r1 = makeRes();
    await handler(makeReq(), r1);
    expect(r1.statusCode).toBe(404);

    store.tournaments = [tournament({ pooled_teams: false })] as any;
    const r2 = makeRes();
    await handler(makeReq(), r2);
    expect(r2.statusCode).toBe(404);
  });
});

describe('GET /api/tournament/[id]/pool', () => {
  it('returns no entry and her teams before sign-up', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      entry: null,
      teams: [{ id: TEAM_A, name: 'Alpha' }],
      teamProgress: null,
    });
  });

  it('shows the team progress for a waitlisted player', async () => {
    store.tournament_pool_entries = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        tournament_id: T_ID,
        user_id: USER,
        status: 'waitlist',
        display_name: 'Mercy',
        battle_tag: 'Mercy#1234',
        origin_team_id: TEAM_A,
        placed_team_id: null,
      },
      {
        tenant_id: CONFERENCE_TENANT_ID,
        tournament_id: T_ID,
        user_id: 'u2',
        status: 'waitlist',
        display_name: 'Ana',
        battle_tag: 'Ana#1234',
        origin_team_id: TEAM_A,
        placed_team_id: null,
      },
      {
        tenant_id: CONFERENCE_TENANT_ID,
        tournament_id: T_ID,
        user_id: 'u3',
        status: 'withdrawn',
        display_name: 'Kiri',
        battle_tag: 'Kiri#1234',
        origin_team_id: TEAM_A,
        placed_team_id: null,
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as any;
    expect(body.entry.status).toBe('waitlist');
    expect(body.entry.originTeam).toEqual({ id: TEAM_A, name: 'Alpha' });
    // La retirée ne compte pas.
    expect(body.teamProgress).toEqual({
      team: { id: TEAM_A, name: 'Alpha' },
      signedUp: 2,
      needed: 5,
      teamRegistered: false,
    });
  });
});

describe('POST /api/tournament/[id]/pool', () => {
  it('calls pool_register with a team size of 5 and reports teamRegistered', async () => {
    setRpcResult('pool_register', {
      data: [{ entry_id: 'e1', entry_status: 'placed', team_registered: true }],
    });
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teamRegistered).toBe(true);
    expect(rpcCalls).toContainEqual({
      fn: 'pool_register',
      params: {
        p_tenant_id: CONFERENCE_TENANT_ID,
        p_tournament_id: T_ID,
        p_user_id: USER,
        p_display_name: 'Mercy',
        p_battle_tag: 'Mercy#1234',
        p_origin_team_id: TEAM_A,
        p_team_size: 5,
      },
    });
  });

  it('accepts a player without a team', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', body: { ...validBody, originTeamId: null } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((rpcCalls[0].params as any).p_origin_team_id).toBeNull();
  });

  it('403 when declaring a team she does not play for — no RPC', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', body: { ...validBody, originTeamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('NOT_TEAM_MEMBER');
    expect(rpcCalls).toHaveLength(0);
  });

  it('400 on a malformed BattleTag', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', body: { ...validBody, battleTag: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BATTLETAG_INVALID');
  });

  it('409 when registrations are not open', async () => {
    store.tournaments = [tournament({ status: 'draft' })] as any;
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toHaveLength(0);
  });

  it('500 when the RPC fails', async () => {
    setRpcResult('pool_register', { error: { message: 'boom' } });
    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /api/tournament/[id]/pool', () => {
  it('withdraws a waitlisted entry', async () => {
    store.tournament_pool_entries = [
      {
        id: 'e1',
        tenant_id: CONFERENCE_TENANT_ID,
        tournament_id: T_ID,
        user_id: USER,
        status: 'waitlist',
        display_name: 'Mercy',
        battle_tag: 'Mercy#1234',
        origin_team_id: null,
        placed_team_id: null,
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(200);
    expect((store.tournament_pool_entries as any[])[0].status).toBe(
      'withdrawn'
    );
    expect((res.body as any).entry).toBeNull();
  });

  it('409 for a placed entry — staff only', async () => {
    store.tournament_pool_entries = [
      {
        id: 'e1',
        tenant_id: CONFERENCE_TENANT_ID,
        tournament_id: T_ID,
        user_id: USER,
        status: 'placed',
        display_name: 'Mercy',
        battle_tag: 'Mercy#1234',
        origin_team_id: TEAM_A,
        placed_team_id: TEAM_A,
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(409);
    expect((store.tournament_pool_entries as any[])[0].status).toBe('placed');
  });
});
