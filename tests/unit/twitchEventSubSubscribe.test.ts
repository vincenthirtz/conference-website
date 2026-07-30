// tests/unit/twitchEventSubSubscribe.test.ts
//
// POST /api/admin/twitch/eventsub/subscribe — le serveur crée les souscriptions
// EventSub (transport websocket) pour une session OUVERTE PAR LE NAVIGATEUR.
// Le token broadcaster reste côté serveur ; le client n'envoie qu'un session_id.
//
// Couvre : 405 (+ Allow), 400 (body invalide), 409 NOT_CONNECTED,
// 403 MISSING_SCOPE (+ missing[]), succès (created), échec partiel (200 + failed)
// et Helix injoignable (502). Aucun appel réseau réel : global.fetch est mocké.
//
// Même socle que twitchBroadcasterActions.test.ts (supabaseMock in-memory +
// logStaffAction mocké).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// Env requis (chiffrement des tokens + client creds Helix).
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

import subscribeHandler from '../../pages/api/admin/twitch/eventsub/subscribe';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

const FOLLOWS_SCOPE = 'moderator:read:followers';
const SHOUTOUTS_SCOPE = 'moderator:read:shoutouts';
const CHAT_SCOPE = 'user:write:chat';

const SESSION_ID = 'AgoQ7Kd8xMKrTgm1r3cW2sample_id';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'caster'
): StaffMember {
  return {
    id: 'staff-caster-1',
    auth_user_id: 'user-1',
    email: 'caster@x.com',
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
    body: { session_id: SESSION_ID },
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

type Body = {
  session_id?: string;
  created?: string[];
  failed?: { type: string; status: number; message: string; code?: string }[];
  missing_scopes?: string[];
  code?: string;
  missing?: string[];
};

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('caster')] as any;
  logStaffActionMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/admin/twitch/eventsub/subscribe', () => {
  it('405 + Allow: POST on a wrong method', async () => {
    seedConnection();
    const res = makeRes();
    await subscribeHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
  });

  it('400 INVALID_PAYLOAD when session_id is missing', async () => {
    seedConnection();
    const res = makeRes();
    await subscribeHandler(makeAuthedReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('INVALID_PAYLOAD');
  });

  it('400 INVALID_PAYLOAD on a malformed session_id', async () => {
    seedConnection();
    const res = makeRes();
    await subscribeHandler(
      makeAuthedReq({ body: { session_id: 'has spaces & <weird>' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('INVALID_PAYLOAD');
  });

  it('409 NOT_CONNECTED when no channel is linked', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as Body).code).toBe('NOT_CONNECTED');
  });

  it('403 MISSING_SCOPE with both scopes listed when none is granted', async () => {
    seedConnection([CHAT_SCOPE]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(403);
    const body = res.body as Body;
    expect(body.code).toBe('MISSING_SCOPE');
    expect(body.missing).toEqual([FOLLOWS_SCOPE, SHOUTOUTS_SCOPE]);
    // Aucune requête Helix tentée.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('200 creates both subscriptions with the websocket transport + condition', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      json: async () => ({ data: [{ id: 'sub-1', status: 'enabled' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.session_id).toBe(SESSION_ID);
    expect(body.failed).toEqual([]);
    expect(body.missing_scopes).toEqual([]);
    expect(body.created).toEqual([
      'channel.follow',
      'channel.shoutout.receive',
    ]);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/eventsub/subscriptions');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.type).toBe('channel.follow');
    expect(sent.version).toBe('2');
    expect(sent.condition).toEqual({
      broadcaster_user_id: 'bc-123',
      moderator_user_id: 'bc-123',
    });
    expect(sent.transport).toEqual({
      method: 'websocket',
      session_id: SESSION_ID,
    });

    const secondSent = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1]
        .body as string
    );
    expect(secondSent.type).toBe('channel.shoutout.receive');
    expect(secondSent.version).toBe('1');

    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('200 partial: creates channel.follow and reports the missing shoutouts scope', async () => {
    seedConnection([FOLLOWS_SCOPE]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 202,
      json: async () => ({ data: [{ id: 'sub-follow', status: 'enabled' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.created).toEqual(['channel.follow']);
    expect(body.missing_scopes).toEqual([SHOUTOUTS_SCOPE]);
    expect(body.failed).toHaveLength(1);
    expect(body.failed?.[0].type).toBe('channel.shoutout.receive');
    expect(body.failed?.[0].status).toBe(403);
    expect(body.failed?.[0].code).toBe('MISSING_SCOPE');
    // Une seule requête Helix : celle dont le scope est accordé.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('200 partial: one Helix 400 lands in failed with its message', async () => {
    seedConnection();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ data: [{ id: 'sub-1', status: 'enabled' }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'subscription already active' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.created).toEqual(['channel.follow']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed?.[0].type).toBe('channel.shoutout.receive');
    expect(body.failed?.[0].status).toBe(400);
    expect(body.failed?.[0].message).toBe('subscription already active');
  });

  it('200 folds a Helix 409 into created (idempotent re-subscribe)', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ message: 'subscription already exists' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.failed).toEqual([]);
    expect(body.created).toHaveLength(2);
    expect(body.created).toEqual([
      'channel.follow',
      'channel.shoutout.receive',
    ]);
  });

  it('502 TWITCH_HELIX_ERROR when Helix is unreachable for everything', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(502);
    const body = res.body as Body;
    expect(body.code).toBe('TWITCH_HELIX_ERROR');
    expect(body.failed).toHaveLength(2);
    expect(body.failed?.[0].status).toBe(0);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('502 TWITCH_HELIX_ERROR when Helix 5xx for every subscription', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: 'service unavailable' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await subscribeHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(502);
    expect((res.body as Body).code).toBe('TWITCH_HELIX_ERROR');
  });
});
