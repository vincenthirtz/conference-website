import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import conversationHandler from '../../pages/api/player/messages/[conversationId]';

const USER_ID = '00000000-0000-0000-0000-000000000aa1';
const TEAM_A = '11111111-1111-1111-1111-111111111111';
const TEAM_B = '22222222-2222-2222-2222-222222222222';

let _bearer = 0;
function freshBearer() {
  _bearer += 1;
  return `Bearer t-${Date.now()}-${_bearer}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return { method: 'GET', headers, query: {}, body: {}, ...over };
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

/** Seed the authed user as captain of TEAM_A so a well-formed conversation
 *  involving TEAM_A passes auth/tenant checks and reaches the query path. */
function seedCaptainOfTeamA() {
  store.teams = [
    { id: TEAM_A, captain_id: USER_ID, name: 'Phenix' },
    { id: TEAM_B, captain_id: null, name: 'Dragons' },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('/api/player/messages/[conversationId] — UUID boundary validation', () => {
  it('rejects a malformed conversationId (filter-injection attempt) with 400', async () => {
    seedCaptainOfTeamA();
    const malicious = `${TEAM_A}_abc),(injection`;
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: malicious } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid conversation ID.' });
  });

  it('rejects a conversationId whose second half is not a UUID with 400', async () => {
    seedCaptainOfTeamA();
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: `${TEAM_A}_not-a-uuid` } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a conversationId with more than one underscore with 400', async () => {
    seedCaptainOfTeamA();
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: `${TEAM_A}_${TEAM_B}_${TEAM_B}` } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a conversationId with no underscore with 400', async () => {
    seedCaptainOfTeamA();
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('proceeds (not 400) for a well-formed <uuidA>_<uuidB> conversationId', async () => {
    seedCaptainOfTeamA();
    store.demandes = [];
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: `${TEAM_A}_${TEAM_B}` } }),
      res
    );
    // Validation passed → reaches the GET handler and returns the conversation.
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      conversationId: `${TEAM_A}_${TEAM_B}`,
      myTeamId: TEAM_A,
    });
  });
});

describe('/api/player/messages/[conversationId] — permission du marquage « lu »', () => {
  // Une coach à qui l'équipe n'a délégué QUE les scrims (surcharge par membre,
  // ni capitanat ni rôle privilégié). Elle gère l'équipe, donc elle LIT les
  // conversations — mais elle ne doit pas pouvoir vider la boîte de réception.
  function seedScrimsOnlyCoachOfTeamA() {
    store.teams = [
      { id: TEAM_A, captain_id: 'someone-else', name: 'Phenix' },
      { id: TEAM_B, captain_id: null, name: 'Dragons' },
    ];
    store.team_members = [
      { team_id: TEAM_A, user_id: USER_ID, role: 'player' },
    ] as any;
    store.team_member_permissions = [
      {
        team_id: TEAM_A,
        user_id: USER_ID,
        permission: 'manage_scrims',
        revoked_at: null,
      },
    ] as any;
  }

  function seedIncomingPending() {
    store.demandes = [
      {
        id: 'msg-1',
        type: 'captain_message',
        team_id: TEAM_A,
        user_id: 'sender',
        comment: 'GG',
        status: 'pending',
        payload: { from_team_id: TEAM_B, from_team_name: 'Dragons' },
        created_at: '2026-09-15T20:00:00Z',
      },
    ] as any;
  }

  const conv = `${TEAM_A}_${TEAM_B}`;

  it('PATCH refusé (403) sans send_captain_messages, messages intacts', async () => {
    seedScrimsOnlyCoachOfTeamA();
    seedIncomingPending();
    const res = makeRes();
    await conversationHandler(
      makeReq({ method: 'PATCH', query: { conversationId: conv } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((store.demandes as any[])[0].status).toBe('pending');
  });

  it('GET reste ouvert à cette même coach (lecture volontairement libre)', async () => {
    seedScrimsOnlyCoachOfTeamA();
    seedIncomingPending();
    const res = makeRes();
    await conversationHandler(
      makeReq({ query: { conversationId: conv } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ myTeamId: TEAM_A });
    expect((store.demandes as any[])[0].status).toBe('pending');
  });

  it('PATCH accepté quand la permission est déléguée', async () => {
    seedScrimsOnlyCoachOfTeamA();
    (store.team_member_permissions as any[]).push({
      team_id: TEAM_A,
      user_id: USER_ID,
      permission: 'send_captain_messages',
      revoked_at: null,
    });
    seedIncomingPending();
    const res = makeRes();
    await conversationHandler(
      makeReq({ method: 'PATCH', query: { conversationId: conv } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('PATCH accepté pour la capitaine (toutes les permissions)', async () => {
    seedCaptainOfTeamA();
    seedIncomingPending();
    const res = makeRes();
    await conversationHandler(
      makeReq({ method: 'PATCH', query: { conversationId: conv } }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
