// tests/unit/freePlayersInvite.test.ts
//
// POST /api/teams/invite-free-player — creates the demande, 409 on duplicate /
// already-member, 403 non-captain, 404 non-free-player.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));
// Blacklist alert is fire-and-forget; stub it out to avoid outbox writes.
vi.mock('@/utils/moderation/blacklist', () => ({
  alertIfBlacklisted: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import inviteHandler from '../../pages/api/teams/invite-free-player';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TEAM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NON_CAPTAIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const FP_LINKED = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NOT_FREE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const D_FP = '300000000000000001';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}, method = 'POST'): any {
  return {
    method,
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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

function seed() {
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
    {
      id: OTHER_TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Bravo',
      captain_id: 'someone-else',
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-cap',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'captain',
    },
  ] as any;
  store.free_players = [
    {
      id: 'fp-linked',
      tenant_id: CONFERENCE_TENANT_ID,
      discord_user_id: D_FP,
      discord_username: 'free-linked',
      auth_user_id: FP_LINKED,
    },
  ] as any;
  store.demandes = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seed();
});

describe('POST /api/teams/invite-free-player', () => {
  it('400 on bad body', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await inviteHandler(makeAuthedReq({ body: { teamId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('403 for a non-captain', async () => {
    setAuthUser({ id: NON_CAPTAIN_ID });
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: TEAM_ID, authUserId: FP_LINKED } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('403 when caller manages a DIFFERENT team', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: OTHER_TEAM_ID, authUserId: FP_LINKED } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('404 when target is not a free player of the tenant', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: TEAM_ID, authUserId: NOT_FREE } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('creates the demande (type=invite) and returns demandeId', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: TEAM_ID, authUserId: FP_LINKED } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    const demandeId = (res.body as any).demandeId;
    expect(typeof demandeId).toBe('string');

    const demandes = store.demandes as any[];
    expect(demandes).toHaveLength(1);
    expect(demandes[0]).toMatchObject({
      tenant_id: CONFERENCE_TENANT_ID,
      user_id: FP_LINKED,
      team_id: TEAM_ID,
      type: 'invite',
      status: 'pending',
      source: 'website',
    });
    expect(demandes[0].payload.invitee_discord_user_id).toBe(D_FP);
  });

  it('409 when a pending invite already exists for this team', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    store.demandes = [
      {
        id: 'demande-existing',
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: FP_LINKED,
        team_id: TEAM_ID,
        type: 'invite',
        status: 'pending',
        payload: {},
      },
    ] as any;
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: TEAM_ID, authUserId: FP_LINKED } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('409 when the target is already a member of the team', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    (store.team_members as any[]).push({
      id: 'tm-already',
      tenant_id: CONFERENCE_TENANT_ID,
      team_id: TEAM_ID,
      user_id: FP_LINKED,
      role: 'player',
    });
    const res = makeRes();
    await inviteHandler(
      makeAuthedReq({ body: { teamId: TEAM_ID, authUserId: FP_LINKED } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });
});
