// tests/unit/apiScrims.test.ts
// Tests pour les endpoints de l'entite Scrim :
//   - Admin   : /api/admin/scrims, /api/admin/scrims/[id], /api/admin/scrims/[id]/matches
//   - Public  : /api/scrims, /api/scrims/[id]
//   - Bot     : /api/bot/scrims, /api/bot/scrims/[id]/matches

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import adminScrimsHandler from '../../pages/api/admin/scrims/index';
import adminScrimIdHandler from '../../pages/api/admin/scrims/[scrimId]/index';
import adminScrimMatchesHandler from '../../pages/api/admin/scrims/[scrimId]/matches';
import publicScrimsHandler from '../../pages/api/scrims/index';
import publicScrimIdHandler from '../../pages/api/scrims/[id]';
import botScrimsHandler from '../../pages/api/bot/v1/scrims/index';
import botScrimIdHandler from '../../pages/api/bot/v1/scrims/[scrimId]/index';
import botScrimMatchesHandler from '../../pages/api/bot/v1/scrims/[scrimId]/matches';
import botScrimMatchPatchHandler from '../../pages/api/bot/v1/scrims/[scrimId]/matches/[matchId]';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

const SCRIM_ID = '550e8400-e29b-41d4-a716-446655440aa1';
const SCRIM_ID_2 = '550e8400-e29b-41d4-a716-446655440aa2';
const TEAM_A = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_B = '550e8400-e29b-41d4-a716-446655440b02';
const DISCORD_ID = '123456789012345678';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts. The
// fallback resolveTenantId() injects this value into req.botContext.tenantId
// when the bot doesn't send x-tenant-id, so fixtures must carry it too for
// the S3 sweep tenant_id filters to match.
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
): StaffMember {
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

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  store.teams = [
    { id: TEAM_A, name: 'Phoenix', short_name: 'PHX', is_active: true },
    { id: TEAM_B, name: 'Dragons', short_name: 'DRG', is_active: true },
  ] as any;
});

/* -----------------------------------------------------------
 * /api/admin/scrims
 * ---------------------------------------------------------*/

describe('/api/admin/scrims', () => {
  it('GET 401 when unauthenticated', async () => {
    setAuthUser(null);
    const res = makeRes();
    await adminScrimsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 403 when role below manager', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    const res = makeRes();
    await adminScrimsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('GET returns scrims list', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Scrim 1',
        slug: 'scrim-1',
        status: 'scheduled',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        is_public: true,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
    const res = makeRes();
    await adminScrimsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrims).toHaveLength(1);
    expect((res.body as any).scrims[0].name).toBe('Scrim 1');
  });

  it('POST 400 when name missing', async () => {
    const res = makeRes();
    await adminScrimsHandler(makeAuthedReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team1 == team2', async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: 'Bad scrim',
          team1_id: TEAM_A,
          team2_id: TEAM_A,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid scheduled_date', async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: 'Bad scrim',
          scheduled_date: 'not-a-date',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST creates a scrim with sane defaults', async () => {
    const res = makeRes();
    await adminScrimsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: 'Phoenix vs Dragons',
          team1_id: TEAM_A,
          team2_id: TEAM_B,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).scrim.name).toBe('Phoenix vs Dragons');
    expect((res.body as any).scrim.status).toBe('draft');
    expect((res.body as any).scrim.is_public).toBe(false);
    expect(store.scrims).toHaveLength(1);
  });

  it('POST 405 on unsupported method', async () => {
    const res = makeRes();
    await adminScrimsHandler(makeAuthedReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/scrims/[scrimId]
 * ---------------------------------------------------------*/

describe('/api/admin/scrims/[scrimId]', () => {
  beforeEach(() => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Existing',
        slug: 'existing',
        status: 'draft',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        is_public: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
  });

  it('GET 400 on invalid id', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({ method: 'GET', query: { scrimId: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when scrim not found', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({ method: 'GET', query: { scrimId: SCRIM_ID_2 } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET returns scrim + matches_count', async () => {
    store.matches = [
      { id: 'm1', scrim_id: SCRIM_ID, status: 'pending' },
      { id: 'm2', scrim_id: SCRIM_ID, status: 'pending' },
    ] as any;
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({ method: 'GET', query: { scrimId: SCRIM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.id).toBe(SCRIM_ID);
    expect((res.body as any).matches_count).toBe(2);
  });

  it('PATCH 400 when no fields provided', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { scrimId: SCRIM_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on invalid status', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { scrimId: SCRIM_ID },
        body: { status: 'not-a-status' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when same team on both sides', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { scrimId: SCRIM_ID },
        body: { team2_id: TEAM_A },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates allowed fields', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { scrimId: SCRIM_ID },
        body: { status: 'scheduled', is_public: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.status).toBe('scheduled');
    expect((res.body as any).scrim.is_public).toBe(true);
  });

  it('DELETE soft-deletes the scrim', async () => {
    const res = makeRes();
    await adminScrimIdHandler(
      makeAuthedReq({ method: 'DELETE', query: { scrimId: SCRIM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Soft-delete : row stays for restoration via /admin/recycle-bin
    // (cf pages/api/admin/scrims/[scrimId]/index.ts).
    expect(store.scrims).toHaveLength(1);
    expect((store.scrims[0] as any).deleted_at).toBeTruthy();
  });
});

/* -----------------------------------------------------------
 * /api/admin/scrims/[scrimId]/matches
 * ---------------------------------------------------------*/

describe('/api/admin/scrims/[scrimId]/matches', () => {
  beforeEach(() => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Existing',
        slug: 'existing',
        status: 'scheduled',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        is_public: true,
      },
    ] as any;
    store.matches = [];
  });

  it('GET returns scrim matches only', async () => {
    store.matches = [
      { id: 'm1', scrim_id: SCRIM_ID, status: 'pending' },
      { id: 'm2', scrim_id: 'other', status: 'pending' },
    ] as any;
    const res = makeRes();
    await adminScrimMatchesHandler(
      makeAuthedReq({ method: 'GET', query: { scrimId: SCRIM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toHaveLength(1);
    expect((res.body as any).matches[0].id).toBe('m1');
  });

  it('POST creates a match prefilled with the scrim teams', async () => {
    const res = makeRes();
    await adminScrimMatchesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { match: { best_of: 3 } },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const matches = (res.body as any).matches;
    expect(matches).toHaveLength(1);
    expect(matches[0].team1_id).toBe(TEAM_A);
    expect(matches[0].team2_id).toBe(TEAM_B);
    expect(matches[0].tournament_id).toBeNull();
    expect(matches[0].scrim_id).toBe(SCRIM_ID);
  });

  it('POST 400 on invalid status', async () => {
    const res = makeRes();
    await adminScrimMatchesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { match: { status: 'bad' } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when scrim does not exist', async () => {
    const res = makeRes();
    await adminScrimMatchesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID_2 },
        body: { match: {} },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

/* -----------------------------------------------------------
 * /api/scrims (public)
 * ---------------------------------------------------------*/

describe('/api/scrims (public)', () => {
  function makeReq(over: Partial<any> = {}): any {
    return {
      method: 'GET',
      headers: { host: 'h' },
      query: {},
      ...over,
    };
  }

  it('GET 405 on non-GET', async () => {
    const res = makeRes();
    await publicScrimsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET hides drafts and non-public scrims', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Visible',
        slug: 'visible',
        status: 'scheduled',
        is_public: true,
      },
      {
        id: SCRIM_ID_2,
        name: 'Hidden draft',
        slug: 'hidden-draft',
        status: 'draft',
        is_public: true,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440aa3',
        name: 'Hidden private',
        slug: 'hidden-private',
        status: 'scheduled',
        is_public: false,
      },
    ] as any;
    const res = makeRes();
    await publicScrimsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const scrims = (res.body as any).scrims;
    expect(scrims).toHaveLength(1);
    expect(scrims[0].name).toBe('Visible');
  });

  it('GET 400 on invalid status (INVALID_STATUS, not silent empty list)', async () => {
    const res = makeRes();
    await publicScrimsHandler(
      makeReq({ query: { status: 'running_nope' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_STATUS');
  });

  it('GET accepts a valid status filter', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Running scrim',
        slug: 'running-scrim',
        status: 'running',
        is_public: true,
      },
    ] as any;
    const res = makeRes();
    await publicScrimsHandler(makeReq({ query: { status: 'running' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrims).toHaveLength(1);
  });
});

describe('/api/scrims/[id] (public)', () => {
  function makeReq(over: Partial<any> = {}): any {
    return {
      method: 'GET',
      headers: { host: 'h' },
      query: {},
      ...over,
    };
  }

  it('GET 400 when id missing', async () => {
    const res = makeRes();
    await publicScrimIdHandler(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when scrim is private', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Private',
        slug: 'private',
        status: 'scheduled',
        is_public: false,
      },
    ] as any;
    const res = makeRes();
    await publicScrimIdHandler(makeReq({ query: { id: SCRIM_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('GET 404 when scrim is draft', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Draft',
        slug: 'draft',
        status: 'draft',
        is_public: true,
      },
    ] as any;
    const res = makeRes();
    await publicScrimIdHandler(makeReq({ query: { id: SCRIM_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('GET returns scrim + matches for a public scrim', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        name: 'Pub',
        slug: 'pub',
        status: 'scheduled',
        is_public: true,
      },
    ] as any;
    store.matches = [
      { id: 'm1', scrim_id: SCRIM_ID, status: 'pending' },
    ] as any;
    const res = makeRes();
    await publicScrimIdHandler(makeReq({ query: { id: SCRIM_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.id).toBe(SCRIM_ID);
    expect((res.body as any).matches).toHaveLength(1);
  });
});

/* -----------------------------------------------------------
 * /api/bot/scrims
 * ---------------------------------------------------------*/

describe('/api/bot/scrims', () => {
  beforeEach(() => {
    seedBotAuth();
    // V2 strict tenant header — withBotRoute checks existence in `tenants`.
    store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
    store.user_discord_links = [
      { discord_user_id: DISCORD_ID, auth_user_id: 'user-1' },
    ] as any;
  });

  function makeBotReq(over: Partial<any> = {}, method = 'POST'): any {
    return {
      method,
      headers: {
        host: 'h',
        'x-api-key': 'test-key',
        'x-tenant-id': CONFERENCE_TENANT_ID,
      },
      query: {},
      body: {},
      ...over,
    };
  }

  it('returns 401 when api key missing', async () => {
    const res = makeRes();
    await botScrimsHandler(
      { ...makeBotReq({}, 'GET'), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('GET lists scrims, hides drafts by default', async () => {
    store.scrims = [
      {
        id: SCRIM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Pub',
        slug: 'p',
        status: 'scheduled',
      },
      {
        id: SCRIM_ID_2,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Draft',
        slug: 'd',
        status: 'draft',
      },
    ] as any;
    const res = makeRes();
    await botScrimsHandler(makeBotReq({}, 'GET'), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrims).toHaveLength(1);
  });

  it('POST 403 when actor is not admin/owner', async () => {
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await botScrimsHandler(
      makeBotReq({
        body: { actorDiscordUserId: DISCORD_ID, name: 'New' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 when actorDiscordUserId malformed', async () => {
    const res = makeRes();
    await botScrimsHandler(
      makeBotReq({ body: { actorDiscordUserId: 'abc', name: 'New' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST creates scrim for admin actor', async () => {
    const res = makeRes();
    await botScrimsHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          name: 'Bot scrim',
          team1_id: TEAM_A,
          team2_id: TEAM_B,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).scrim.name).toBe('Bot scrim');
    expect(store.scrims).toHaveLength(1);
  });
});

/* -----------------------------------------------------------
 * /api/bot/scrims/[scrimId]  (GET + PATCH)
 * ---------------------------------------------------------*/

describe('/api/bot/scrims/[scrimId]', () => {
  beforeEach(() => {
    seedBotAuth();
    store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
    store.user_discord_links = [
      { discord_user_id: DISCORD_ID, auth_user_id: 'user-1' },
    ] as any;
    store.scrims = [
      {
        id: SCRIM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Bot scrim',
        slug: 'bot-scrim',
        status: 'scheduled',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        is_public: true,
      },
    ] as any;
  });

  function makeBotReq(over: Partial<any> = {}): any {
    return {
      method: 'GET',
      headers: {
        host: 'h',
        'x-api-key': 'test-key',
        'x-tenant-id': CONFERENCE_TENANT_ID,
      },
      query: { scrimId: SCRIM_ID },
      body: {},
      ...over,
    };
  }

  it('GET 401 without api key', async () => {
    const res = makeRes();
    await botScrimIdHandler({ ...makeBotReq(), headers: { host: 'h' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('GET returns scrim + matches', async () => {
    store.matches = [
      {
        id: 'm1',
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await botScrimIdHandler(makeBotReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.id).toBe(SCRIM_ID);
    expect((res.body as any).matches).toHaveLength(1);
  });

  it('GET resolves scrim by slug', async () => {
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({ query: { scrimId: 'bot-scrim' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.id).toBe(SCRIM_ID);
  });

  it('GET 404 when not found', async () => {
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({ query: { scrimId: SCRIM_ID_2 } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 403 when actor not admin/owner', async () => {
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({
        method: 'PATCH',
        body: { actorDiscordUserId: DISCORD_ID, status: 'completed' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('PATCH 400 on invalid status', async () => {
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({
        method: 'PATCH',
        body: { actorDiscordUserId: DISCORD_ID, status: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates status', async () => {
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({
        method: 'PATCH',
        body: { actorDiscordUserId: DISCORD_ID, status: 'completed' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).scrim.status).toBe('completed');
  });

  it('PATCH 400 when no fields', async () => {
    const res = makeRes();
    await botScrimIdHandler(
      makeBotReq({
        method: 'PATCH',
        body: { actorDiscordUserId: DISCORD_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/bot/scrims/[scrimId]/matches/[matchId]  (PATCH)
 * ---------------------------------------------------------*/

describe('/api/bot/scrims/[scrimId]/matches/[matchId]', () => {
  const MATCH_ID = '550e8400-e29b-41d4-a716-446655440c01';
  const OTHER_MATCH_ID = '550e8400-e29b-41d4-a716-446655440c02';

  beforeEach(() => {
    seedBotAuth();
    store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
    store.user_discord_links = [
      { discord_user_id: DISCORD_ID, auth_user_id: 'user-1' },
    ] as any;
    store.scrims = [
      {
        id: SCRIM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Match update',
        slug: 'match-update',
        status: 'running',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
      },
    ] as any;
    store.matches = [
      {
        id: MATCH_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        tournament_id: null,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        status: 'pending',
        team1_score: null,
        team2_score: null,
      },
      {
        id: OTHER_MATCH_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID_2,
        tournament_id: null,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        status: 'pending',
      },
    ] as any;
  });

  function makeBotReq(over: Partial<any> = {}): any {
    return {
      method: 'PATCH',
      headers: {
        host: 'h',
        'x-api-key': 'test-key',
        'x-tenant-id': CONFERENCE_TENANT_ID,
      },
      query: { scrimId: SCRIM_ID, matchId: MATCH_ID },
      body: { actorDiscordUserId: DISCORD_ID },
      ...over,
    };
  }

  it('405 on non-PATCH', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(makeBotReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid scrimId', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({ query: { scrimId: 'bad', matchId: MATCH_ID } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when match missing', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({
        query: { scrimId: SCRIM_ID, matchId: SCRIM_ID_2 },
        body: { actorDiscordUserId: DISCORD_ID, team1_score: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when match belongs to another scrim', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({
        query: { scrimId: SCRIM_ID, matchId: OTHER_MATCH_ID },
        body: { actorDiscordUserId: DISCORD_ID, team1_score: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('updates scores and derives winner_team_id', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          team1_score: 3,
          team2_score: 1,
          status: 'finished',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.team1_score).toBe(3);
    expect((res.body as any).match.winner_team_id).toBe(TEAM_A);
    expect((res.body as any).match.completed_at).toBeTruthy();
  });

  it('rejects winner_team_id that is neither team', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          winner_team_id: '550e8400-e29b-41d4-a716-446655440b99',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid status', async () => {
    const res = makeRes();
    await botScrimMatchPatchHandler(
      makeBotReq({
        body: { actorDiscordUserId: DISCORD_ID, status: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/bot/scrims/[scrimId]/matches
 * ---------------------------------------------------------*/

describe('/api/bot/scrims/[scrimId]/matches', () => {
  beforeEach(() => {
    seedBotAuth();
    store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
    store.user_discord_links = [
      { discord_user_id: DISCORD_ID, auth_user_id: 'user-1' },
    ] as any;
    store.scrims = [
      {
        id: SCRIM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Scrim',
        slug: 's',
        status: 'scheduled',
        team1_id: TEAM_A,
        team2_id: TEAM_B,
      },
    ] as any;
    store.matches = [];
  });

  function makeBotReq(over: Partial<any> = {}): any {
    return {
      method: 'POST',
      headers: {
        host: 'h',
        'x-api-key': 'test-key',
        'x-tenant-id': CONFERENCE_TENANT_ID,
      },
      query: { scrimId: SCRIM_ID },
      body: {},
      ...over,
    };
  }

  it('401 without api key', async () => {
    const res = makeRes();
    await botScrimMatchesHandler(
      { ...makeBotReq(), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 on invalid scrimId', async () => {
    const res = makeRes();
    await botScrimMatchesHandler(
      makeBotReq({ query: { scrimId: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET returns matches for the scrim', async () => {
    store.matches = [
      {
        id: 'm1',
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: SCRIM_ID,
        status: 'pending',
      },
      {
        id: 'm2',
        tenant_id: CONFERENCE_TENANT_ID,
        scrim_id: 'other',
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await botScrimMatchesHandler(makeBotReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toHaveLength(1);
    expect((res.body as any).matches[0].id).toBe('m1');
  });

  it('404 when scrim missing', async () => {
    const res = makeRes();
    await botScrimMatchesHandler(
      makeBotReq({
        query: { scrimId: SCRIM_ID_2 },
        body: {
          actorDiscordUserId: DISCORD_ID,
          match: {},
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('creates batched matches and tags scrim_id', async () => {
    const res = makeRes();
    await botScrimMatchesHandler(
      makeBotReq({
        body: {
          actorDiscordUserId: DISCORD_ID,
          matches: [{ best_of: 1 }, { best_of: 3 }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).count).toBe(2);
    for (const m of store.matches) {
      expect((m as any).scrim_id).toBe(SCRIM_ID);
      expect((m as any).tournament_id).toBeNull();
    }
  });
});
