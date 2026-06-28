// Unit tests for the WEB (player) invitation endpoints:
//   - GET  /api/player/invitations           (list own pending invites)
//   - POST /api/player/invitations/{demandeId} (accept | reject)
//
// These reuse the business helpers in utils/teams/invitations.ts (accept/
// reject/list) under web auth (withAuthRoute → Bearer). We exercise the real
// helpers against the in-memory supabase mock; the only collaborators stubbed
// are the side-effecting ones the accept path pulls in transitively:
//   - rosterLock      (keep the target team unlocked)
//   - botRoleSync     (role-sync event emitter — asserted elsewhere)

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

// supabase + rateLimit are mocked globally via testSetup.ts.

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

vi.mock('@/utils/botRoleSync', () => ({
  emitRoleSyncEvent: vi.fn(async () => undefined),
}));

import listHandler from '../../pages/api/player/invitations/index';
import actionHandler from '../../pages/api/player/invitations/[demandeId]';

const USER_ID = '00000000-0000-0000-0000-000000000aa1';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000aa2';
const CAPTAIN_ID = '00000000-0000-0000-0000-000000000ca1';
const TEAM_ID = '00000000-0000-0000-0000-000000000bb1';
const INVITE_ID = '00000000-0000-0000-0000-000000000ee1';
const OTHER_INVITE_ID = '00000000-0000-0000-0000-000000000ee2';

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

function futureIso(daysFromNow = 3) {
  return new Date(Date.now() + daysFromNow * 24 * 3600_000).toISOString();
}

function pendingInvite(over: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    user_id: USER_ID,
    team_id: TEAM_ID,
    type: 'invite',
    status: 'pending',
    comment: null,
    source: 'discord_bot',
    created_at: new Date().toISOString(),
    processed_at: null,
    payload: {
      captain_auth_user_id: CAPTAIN_ID,
      captain_discord_user_id: '111111111111111111',
      invitee_discord_user_id: '222222222222222222',
      desired_role: 'dps',
      battle_tag: 'Hero#1234',
      expires_at: futureIso(),
    },
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('GET /api/player/invitations', () => {
  it('401 when unauthenticated', async () => {
    const res = makeRes();
    await listHandler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await listHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('lists only the caller pending invites, enriched with team name', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Phenix' }];
    store.demandes = [
      pendingInvite(),
      // another user's invite — must NOT appear
      pendingInvite({ id: OTHER_INVITE_ID, user_id: OTHER_USER_ID }),
      // already-processed invite for the caller — must NOT appear
      pendingInvite({ id: 'done', status: 'approved' }),
    ];
    const res = makeRes();
    await listHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0]).toMatchObject({
      id: INVITE_ID,
      teamId: TEAM_ID,
      teamName: 'Phenix',
      role: 'dps',
      battleTag: 'Hero#1234',
    });
  });
});

describe('POST /api/player/invitations/{demandeId}', () => {
  it('401 when unauthenticated', async () => {
    const res = makeRes();
    await actionHandler(
      makeReq(
        {
          method: 'POST',
          query: { demandeId: INVITE_ID },
          body: { action: 'accept' },
        },
        false
      ),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await actionHandler(
      makeReq({ method: 'GET', query: { demandeId: INVITE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid demandeId (not a UUID)', async () => {
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: 'not-a-uuid' },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 on invalid action', async () => {
    store.demandes = [pendingInvite()];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'maybe' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('accept makes the caller a member and approves the demande', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Phenix' }];
    store.team_members = [];
    store.demandes = [pendingInvite()];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      action: 'accept',
      teamId: TEAM_ID,
    });

    // membership inserted for the caller
    const membership = store.team_members.find(
      (m) => m.user_id === USER_ID && m.team_id === TEAM_ID
    );
    expect(membership).toBeTruthy();
    expect(membership!.role).toBe('dps');

    // demande flipped to approved
    const demande = store.demandes.find((d) => d.id === INVITE_ID);
    expect(demande!.status).toBe('approved');
  });

  it('reject flips the demande to rejected with no membership', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Phenix' }];
    store.team_members = [];
    store.demandes = [pendingInvite()];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'reject' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, action: 'reject' });

    const demande = store.demandes.find((d) => d.id === INVITE_ID);
    expect(demande!.status).toBe('rejected');
    expect(store.team_members).toHaveLength(0);
  });

  it('403 when acting on someone else invitation', async () => {
    store.demandes = [pendingInvite({ user_id: OTHER_USER_ID })];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('409 when the caller is already on a team', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Phenix' }];
    store.team_members = [
      { id: 'tm-x', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
    ];
    store.demandes = [pendingInvite()];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('410 when the invitation has expired', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Phenix' }];
    store.team_members = [];
    store.demandes = [
      pendingInvite({
        payload: {
          captain_auth_user_id: CAPTAIN_ID,
          captain_discord_user_id: '111111111111111111',
          invitee_discord_user_id: '222222222222222222',
          desired_role: 'dps',
          battle_tag: null,
          expires_at: new Date(Date.now() - 3600_000).toISOString(),
        },
      }),
    ];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(410);
  });

  it('404 when the invitation does not exist', async () => {
    store.demandes = [];
    const res = makeRes();
    await actionHandler(
      makeReq({
        method: 'POST',
        query: { demandeId: INVITE_ID },
        body: { action: 'accept' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
