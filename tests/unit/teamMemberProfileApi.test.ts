// Unit tests for PATCH /api/teams/[teamId]/members/[memberId]/profile.
//
// Verifies:
//   - method + auth + UUID validation
//   - permission (self, captain, manager, plain teammate rejected)
//   - field validation (display_name length, specialty whitelist, avatar URL,
//     pronouns/tagline caps, javascript: rejection)
//   - is_substitute is privileged (self can't flip her own status)
//   - audit log records only the actually-changed fields

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/teams/[teamId]/members/[memberId]/profile';

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_PLAYER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const MEMBER_CAPTAIN = '11111111-1111-1111-1111-111111111111';
const MEMBER_MANAGER = '22222222-2222-2222-2222-222222222222';
const MEMBER_PLAYER = '33333333-3333-3333-3333-333333333333';
const MEMBER_OTHER = '44444444-4444-4444-4444-444444444444';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, withAuth = true): any {
  return {
    method: 'PATCH',
    headers: {
      host: 'h',
      ...(withAuth ? { authorization: `Bearer ${freshToken()}` } : {}),
    },
    query: { teamId: TEAM_ID, memberId: MEMBER_PLAYER },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: MEMBER_CAPTAIN,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      battle_tag: 'Cap#1',
      display_name: null,
      specialty: null,
      avatar_url: null,
      pronouns: null,
      tagline: null,
      twitter: null,
      twitch: null,
      is_substitute: false,
    },
    {
      id: MEMBER_MANAGER,
      team_id: TEAM_ID,
      user_id: MANAGER_ID,
      role: 'manager',
      battle_tag: 'Mgr#1',
      display_name: null,
      specialty: null,
      avatar_url: null,
      pronouns: null,
      tagline: null,
      twitter: null,
      twitch: null,
      is_substitute: false,
    },
    {
      id: MEMBER_PLAYER,
      team_id: TEAM_ID,
      user_id: PLAYER_ID,
      role: 'player',
      battle_tag: 'Ply#1',
      display_name: null,
      specialty: null,
      avatar_url: null,
      pronouns: null,
      tagline: null,
      twitter: null,
      twitch: null,
      is_substitute: false,
    },
    {
      id: MEMBER_OTHER,
      team_id: TEAM_ID,
      user_id: OTHER_PLAYER_ID,
      role: 'player',
      battle_tag: 'Other#1',
      display_name: null,
      specialty: null,
      avatar_url: null,
      pronouns: null,
      tagline: null,
      twitter: null,
      twitch: null,
      is_substitute: false,
    },
  ] as any;
  store.team_audit_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: PLAYER_ID });
  seedTeam();
});

/* -----------------------------------------------------------
 * Method + auth
 * ---------------------------------------------------------*/
describe('method + auth', () => {
  it('rejects non-PATCH methods with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests with 401', async () => {
    setAuthUser(null);
    const res = makeRes();
    await handler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid teamId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { teamId: 'bad', memberId: MEMBER_PLAYER } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid memberId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { teamId: TEAM_ID, memberId: 'bad' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when member not in team', async () => {
    const ghost = '99999999-9999-9999-9999-999999999999';
    const res = makeRes();
    await handler(
      makeReq({ query: { teamId: TEAM_ID, memberId: ghost } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

/* -----------------------------------------------------------
 * Permission
 * ---------------------------------------------------------*/
describe('permission', () => {
  it('a member can edit her own profile', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { display_name: 'Lyra' } }), res);
    expect(res.statusCode).toBe(200);
    expect(
      (store.team_members as any[]).find((m) => m.id === MEMBER_PLAYER)
        .display_name
    ).toBe('Lyra');
  });

  it('captain can edit any member', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(
      makeReq({
        query: { teamId: TEAM_ID, memberId: MEMBER_OTHER },
        body: { display_name: 'Renamed' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.team_members as any[]).find((m) => m.id === MEMBER_OTHER)
        .display_name
    ).toBe('Renamed');
  });

  it('manager (edit_public_page perm) can edit any teammate', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await handler(
      makeReq({
        query: { teamId: TEAM_ID, memberId: MEMBER_OTHER },
        body: { display_name: 'ByManager' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('a plain player cannot edit a teammate', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await handler(
      makeReq({
        query: { teamId: TEAM_ID, memberId: MEMBER_OTHER },
        body: { display_name: 'Hijack' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * Field validation
 * ---------------------------------------------------------*/
describe('field validation', () => {
  it('rejects display_name longer than 60 chars', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { display_name: 'a'.repeat(61) } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid specialty', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { specialty: 'Tank' } }), res);
    expect(res.statusCode).toBe(200);
    expect(
      (store.team_members as any[]).find((m) => m.id === MEMBER_PLAYER).specialty
    ).toBe('tank');
  });

  it('rejects unknown specialty values', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { specialty: 'sniper' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects avatar_url with javascript: protocol', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { avatar_url: 'javascript:alert(1)' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid avatar_url and stores it', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { avatar_url: 'https://cdn.example.com/a.png' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.team_members as any[]).find((m) => m.id === MEMBER_PLAYER)
        .avatar_url
    ).toBe('https://cdn.example.com/a.png');
  });

  it('rejects pronouns longer than 20 chars', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { pronouns: 'a'.repeat(21) } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects tagline longer than 120 chars', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { tagline: 'a'.repeat(121) } }), res);
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * Substitute toggle
 * ---------------------------------------------------------*/
describe('is_substitute', () => {
  it('player cannot flip her own substitute status', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await handler(makeReq({ body: { is_substitute: true } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('captain can flip a member to substitute', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(
      makeReq({
        query: { teamId: TEAM_ID, memberId: MEMBER_PLAYER },
        body: { is_substitute: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.team_members as any[]).find((m) => m.id === MEMBER_PLAYER)
        .is_substitute
    ).toBe(true);
  });
});

/* -----------------------------------------------------------
 * Audit log
 * ---------------------------------------------------------*/
describe('audit log', () => {
  it('records only changed fields under update_member_profile', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { display_name: 'Lyra', tagline: null } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const logs = store.team_audit_logs as any[];
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('update_member_profile');
    expect(logs[0].payload.member_id).toBe(MEMBER_PLAYER);
    expect(Object.keys(logs[0].payload.diff)).toEqual(['display_name']);
  });

  it('does not insert an audit row when nothing changes', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((store.team_audit_logs as any[]).length).toBe(0);
  });
});
