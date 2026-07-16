// tests/unit/twitchBroadcasterActions.test.ts
//
// Actions Twitch écrivantes depuis la régie (par-dessus le socle OAuth +
// Predictions) : chat, modération (ban / clear / chat-settings), points de
// chaîne (rewards / redemptions) et clip.
//
// Par famille : au moins un succès (token mocké + Helix mocké), NOT_CONNECTED
// (409), MISSING_SCOPE (403) et validation (400). Aucun appel réseau réel :
// global.fetch (Helix) est mocké par test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// Env requis (chiffrement + secret HMAC du state + client creds Helix).
process.env.TWITCH_TOKEN_ENC_KEY = 'test-enc-key-please-change';
process.env.TWITCH_CLIENT_SECRET = 'test-client-secret';
process.env.TWITCH_CLIENT_ID = 'test-client-id';
process.env.TWITCH_REDIRECT_URI =
  'https://example.test/api/twitch/broadcaster-callback';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

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
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { encryptSecret } from '../../utils/crypto';
import { BROADCASTER_SCOPES } from '../../utils/twitchBroadcaster';

import chatHandler from '../../pages/api/admin/twitch/chat';
import banHandler from '../../pages/api/admin/twitch/moderation/ban';
import clearHandler from '../../pages/api/admin/twitch/moderation/clear';
import chatSettingsHandler from '../../pages/api/admin/twitch/moderation/chat-settings';
import rewardsHandler from '../../pages/api/admin/twitch/channel-points/rewards';
import redemptionsHandler from '../../pages/api/admin/twitch/channel-points/redemptions';
import clipHandler from '../../pages/api/admin/twitch/clip';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

const CHAT_SCOPE = 'user:write:chat';
const BAN_SCOPE = 'moderator:manage:banned_users';
const CLEAR_SCOPE = 'moderator:manage:chat_messages';
const CHAT_SETTINGS_SCOPE = 'moderator:manage:chat_settings';
const REDEMPTIONS_READ_SCOPE = 'channel:read:redemptions';
const REDEMPTIONS_MANAGE_SCOPE = 'channel:manage:redemptions';
const CLIP_SCOPE = 'clips:edit';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
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
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

/** Seed une connexion broadcaster valide (union des scopes par défaut). */
function seedConnection(scope: string[] = [...BROADCASTER_SCOPES]) {
  store.twitch_broadcaster_connections = [
    {
      tenant_id: TENANT_X,
      broadcaster_id: 'bc-123',
      broadcaster_login: 'mychannel',
      access_token_enc: encryptSecret('live-access-token'),
      refresh_token_enc: encryptSecret('live-refresh-token'),
      scope,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      connected_by_user_id: 'user-1',
    },
  ] as any;
}

function mockFetchOk(payload: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
  logStaffActionMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ===========================================================
 * POST /api/admin/twitch/chat
 * =========================================================*/

describe('POST /api/admin/twitch/chat', () => {
  it('200 sends a chat message (mocked token + Helix)', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({ data: [{ message_id: 'm-1' }] });
    const res = makeRes();
    await chatHandler(makeAuthedReq({ body: { message: 'gg wp' } }), res);

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/chat/messages');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.broadcaster_id).toBe('bc-123');
    expect(sent.sender_id).toBe('bc-123');
    expect(sent.message).toBe('gg wp');
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await chatHandler(makeAuthedReq({ body: { message: 'hi' } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without user:write:chat', async () => {
    seedConnection([CLIP_SCOPE]);
    const res = makeRes();
    await chatHandler(makeAuthedReq({ body: { message: 'hi' } }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('400 on empty message', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await chatHandler(makeAuthedReq({ body: { message: '' } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });
});

/* ===========================================================
 * POST /api/admin/twitch/moderation/ban
 * =========================================================*/

describe('POST /api/admin/twitch/moderation/ban', () => {
  it('200 resolves login → user_id then bans (mocked Helix)', async () => {
    seedConnection();
    const fetchMock = vi
      .fn()
      // 1er appel : lookup login
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'u-999', login: 'troll' }] }),
      })
      // 2e appel : ban
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ user_id: 'u-999' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await banHandler(
      makeAuthedReq({
        body: { login: 'troll', duration: 600, reason: 'spam' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [lookupUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(lookupUrl).toContain('/helix/users?login=troll');
    const [banUrl, banInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(banUrl).toContain('/helix/moderation/bans');
    expect(banUrl).toContain('moderator_id=bc-123');
    const sent = JSON.parse(banInit.body as string);
    expect(sent.data.user_id).toBe('u-999');
    expect(sent.data.duration).toBe(600);
    expect(sent.data.reason).toBe('spam');
  });

  it('400 USER_NOT_FOUND when the login resolves to nothing', async () => {
    seedConnection();
    mockFetchOk({ data: [] }); // lookup vide
    const res = makeRes();
    await banHandler(makeAuthedReq({ body: { login: 'ghost' } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('USER_NOT_FOUND');
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await banHandler(makeAuthedReq({ body: { login: 'troll' } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without moderator:manage:banned_users', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await banHandler(makeAuthedReq({ body: { login: 'troll' } }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('400 on invalid duration (over max)', async () => {
    seedConnection([BAN_SCOPE]);
    const res = makeRes();
    await banHandler(
      makeAuthedReq({ body: { login: 'troll', duration: 9_999_999 } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });
});

/* ===========================================================
 * POST /api/admin/twitch/moderation/clear
 * =========================================================*/

describe('POST /api/admin/twitch/moderation/clear', () => {
  it('200 clears the chat (DELETE helix/moderation/chat)', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await clearHandler(makeAuthedReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/moderation/chat');
    expect(init.method).toBe('DELETE');
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await clearHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without moderator:manage:chat_messages', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await clearHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('405 on wrong method', async () => {
    seedConnection([CLEAR_SCOPE]);
    const res = makeRes();
    await clearHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================
 * PATCH /api/admin/twitch/moderation/chat-settings
 * =========================================================*/

describe('PATCH /api/admin/twitch/moderation/chat-settings', () => {
  it('200 updates chat settings (mocked Helix)', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({ data: [{ slow_mode: true }] });
    const res = makeRes();
    await chatSettingsHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { slow_mode: true, slow_mode_wait_time: 30 },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/chat/settings');
    expect(url).toContain('moderator_id=bc-123');
    expect(init.method).toBe('PATCH');
    const sent = JSON.parse(init.body as string);
    expect(sent.slow_mode).toBe(true);
    expect(sent.slow_mode_wait_time).toBe(30);
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await chatSettingsHandler(
      makeAuthedReq({ method: 'PATCH', body: { emote_mode: true } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without moderator:manage:chat_settings', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await chatSettingsHandler(
      makeAuthedReq({ method: 'PATCH', body: { emote_mode: true } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('400 when no setting is provided (empty body)', async () => {
    seedConnection([CHAT_SETTINGS_SCOPE]);
    const res = makeRes();
    await chatSettingsHandler(
      makeAuthedReq({ method: 'PATCH', body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });
});

/* ===========================================================
 * GET /api/admin/twitch/channel-points/rewards
 * =========================================================*/

describe('GET /api/admin/twitch/channel-points/rewards', () => {
  it('200 lists manageable rewards (only_manageable_rewards=true)', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({ data: [{ id: 'rw-1', title: 'Skip' }] });
    const res = makeRes();
    await rewardsHandler(makeAuthedReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { rewards: unknown[] }).rewards).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/helix/channel_points/custom_rewards');
    expect(url).toContain('only_manageable_rewards=true');
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await rewardsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without channel:read:redemptions', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await rewardsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });
});

/* ===========================================================
 * /api/admin/twitch/channel-points/redemptions
 * =========================================================*/

describe('GET /api/admin/twitch/channel-points/redemptions', () => {
  it('200 lists redemptions for a reward', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({
      data: [{ id: 'rd-1', status: 'UNFULFILLED' }],
    });
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({ method: 'GET', query: { reward_id: 'rw-1' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/helix/channel_points/custom_rewards/redemptions');
    expect(url).toContain('reward_id=rw-1');
    expect(url).toContain('status=UNFULFILLED');
  });

  it('400 when reward_id is missing', async () => {
    seedConnection([REDEMPTIONS_READ_SCOPE]);
    const res = makeRes();
    await redemptionsHandler(makeAuthedReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('403 MISSING_SCOPE without channel:read:redemptions', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({ method: 'GET', query: { reward_id: 'rw-1' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });
});

describe('PATCH /api/admin/twitch/channel-points/redemptions', () => {
  it('200 fulfills a batch of redemptions', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({
      data: [{ id: 'rd-1', status: 'FULFILLED' }],
    });
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: {
          reward_id: 'rw-1',
          redemption_ids: ['rd-1', 'rd-2'],
          status: 'FULFILLED',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('reward_id=rw-1');
    expect(url).toContain('id=rd-1');
    expect(url).toContain('id=rd-2');
    expect(init.method).toBe('PATCH');
    const sent = JSON.parse(init.body as string);
    expect(sent.status).toBe('FULFILLED');
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: {
          reward_id: 'rw-1',
          redemption_ids: ['rd-1'],
          status: 'CANCELED',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without channel:manage:redemptions', async () => {
    seedConnection([REDEMPTIONS_READ_SCOPE]); // read only, pas manage
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: {
          reward_id: 'rw-1',
          redemption_ids: ['rd-1'],
          status: 'FULFILLED',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('400 on invalid status', async () => {
    seedConnection([REDEMPTIONS_MANAGE_SCOPE]);
    const res = makeRes();
    await redemptionsHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: {
          reward_id: 'rw-1',
          redemption_ids: ['rd-1'],
          status: 'UNFULFILLED', // pas accepté au PATCH
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });
});

/* ===========================================================
 * POST /api/admin/twitch/clip
 * =========================================================*/

describe('POST /api/admin/twitch/clip', () => {
  it('200 creates a clip and returns { id, edit_url }', async () => {
    seedConnection();
    const fetchMock = mockFetchOk({
      data: [{ id: 'clip-1', edit_url: 'https://clips.twitch.tv/edit/clip-1' }],
    });
    const res = makeRes();
    await clipHandler(makeAuthedReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { id: string; edit_url: string };
    expect(body.id).toBe('clip-1');
    expect(body.edit_url).toBe('https://clips.twitch.tv/edit/clip-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/clips');
    expect(url).toContain('broadcaster_id=bc-123');
    expect(init.method).toBe('POST');
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await clipHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE without clips:edit', async () => {
    seedConnection([CHAT_SCOPE]);
    const res = makeRes();
    await clipHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('405 on wrong method', async () => {
    seedConnection([CLIP_SCOPE]);
    const res = makeRes();
    await clipHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
