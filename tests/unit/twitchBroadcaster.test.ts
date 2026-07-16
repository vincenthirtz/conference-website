// tests/unit/twitchBroadcaster.test.ts
//
// Socle « actions Twitch écrivantes depuis la régie » — OAuth broadcaster +
// Predictions.
//
// Couvre :
//   - crypto (utils/crypto) : encrypt→decrypt = identité ; tamper → throw.
//   - state signé (utils/twitchBroadcaster) : valide / expiré / altéré.
//   - storeConnection → getValidBroadcasterToken : round-trip chiffré.
//   - POST /api/admin/twitch/predictions : 409 NOT_CONNECTED, 201 création OK
//     (token mocké + Helix mocké), 403 MISSING_SCOPE.
//   - PATCH /api/admin/twitch/predictions/[id] : RESOLVED sans winning_outcome_id → 400.
//
// Aucun appel réseau réel : global.fetch (Helix) est mocké par test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  supabaseAdmin as mockAdmin,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { encryptSecret, decryptSecret } from '../../utils/crypto';
import {
  signState,
  verifyState,
  storeConnection,
  getValidBroadcasterToken,
} from '../../utils/twitchBroadcaster';

import predictionsHandler from '../../pages/api/admin/twitch/predictions/index';
import predictionPatchHandler from '../../pages/api/admin/twitch/predictions/[id]';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const PREDICTIONS_SCOPE = 'channel:manage:predictions';

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

/** Seed une connexion broadcaster valide (tokens chiffrés, expiration future). */
function seedConnection(scope: string[] = [PREDICTIONS_SCOPE]) {
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
 * crypto round-trip
 * =========================================================*/

describe('utils/crypto encrypt/decrypt', () => {
  it('round-trips a secret (encrypt → decrypt = identity)', () => {
    const secret = 'oauth-access-token-🔒-éàü';
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('throws when the ciphertext is tampered (GCM auth failure)', () => {
    const enc = encryptSecret('sensitive');
    const parts = enc.split('.');
    // Flip a character in the ciphertext segment.
    const ct = parts[3]!;
    const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    const tampered = [parts[0], parts[1], parts[2], flipped].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

/* ===========================================================
 * state sign/verify
 * =========================================================*/

describe('twitchBroadcaster signState/verifyState', () => {
  const base = {
    tenantId: TENANT_X,
    userId: 'user-1',
    nonce: 'nonce-abc',
    returnTo: '/admin/broadcast/live',
  };

  it('verifies a freshly signed state', () => {
    const state = signState(base);
    const payload = verifyState(state);
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe(TENANT_X);
    expect(payload!.userId).toBe('user-1');
    expect(payload!.nonce).toBe('nonce-abc');
    expect(payload!.returnTo).toBe('/admin/broadcast/live');
  });

  it('rejects an expired state (issuedAt beyond TTL)', () => {
    const state = signState({ ...base, issuedAt: Date.now() - 20 * 60 * 1000 });
    expect(verifyState(state)).toBeNull();
  });

  it('rejects a tampered state (bad signature)', () => {
    const state = signState(base);
    const dot = state.indexOf('.');
    const body = state.slice(0, dot);
    const flippedBody = (body[0] === 'a' ? 'b' : 'a') + body.slice(1);
    const tampered = `${flippedBody}.${state.slice(dot + 1)}`;
    expect(verifyState(tampered)).toBeNull();
  });
});

/* ===========================================================
 * storeConnection → getValidBroadcasterToken
 * =========================================================*/

describe('storeConnection + getValidBroadcasterToken', () => {
  it('persists encrypted tokens and returns a decrypted access token', async () => {
    const admin = mockAdmin as unknown as SupabaseClient;
    await storeConnection(admin, {
      tenantId: TENANT_X,
      accessToken: 'access-XYZ',
      refreshToken: 'refresh-XYZ',
      expiresIn: 3600,
      scope: [PREDICTIONS_SCOPE],
      broadcasterId: 'bc-999',
      login: 'stored-channel',
      userId: 'user-1',
    });

    const row = (store.twitch_broadcaster_connections as any[])[0];
    expect(row.access_token_enc).not.toContain('access-XYZ');
    expect(row.access_token_enc.startsWith('v1.')).toBe(true);

    const token = await getValidBroadcasterToken(admin, TENANT_X);
    expect(token).not.toBeNull();
    expect(token!.accessToken).toBe('access-XYZ');
    expect(token!.broadcasterId).toBe('bc-999');
    expect(token!.scope).toContain(PREDICTIONS_SCOPE);
  });

  it('returns null when no connection exists', async () => {
    const admin = mockAdmin as unknown as SupabaseClient;
    const token = await getValidBroadcasterToken(admin, TENANT_X);
    expect(token).toBeNull();
  });
});

/* ===========================================================
 * POST /api/admin/twitch/predictions
 * =========================================================*/

describe('POST /api/admin/twitch/predictions', () => {
  it('409 NOT_CONNECTED when the tenant has no broadcaster connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await predictionsHandler(
      makeAuthedReq({
        body: {
          title: 'Qui gagne ?',
          outcomes: ['A', 'B'],
          prediction_window: 120,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });

  it('201 creates a prediction with a mocked valid token + mocked Helix', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'pred-1',
            title: 'Qui gagne ?',
            outcomes: [
              { id: 'o1', title: 'A' },
              { id: 'o2', title: 'B' },
            ],
            status: 'ACTIVE',
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await predictionsHandler(
      makeAuthedReq({
        body: {
          title: 'Qui gagne ?',
          outcomes: ['A', 'B'],
          prediction_window: 120,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const body = res.body as { prediction: { id: string; status: string } };
    expect(body.prediction.id).toBe('pred-1');

    // Helix appelé avec le bon endpoint + broadcaster_id issu du token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/predictions');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.broadcaster_id).toBe('bc-123');
    expect(sent.outcomes).toEqual([{ title: 'A' }, { title: 'B' }]);
    expect(sent.prediction_window).toBe(120);
  });

  it('403 MISSING_SCOPE when the connection lacks channel:manage:predictions', async () => {
    seedConnection(['clips:edit']); // scope predictions absent
    const res = makeRes();
    await predictionsHandler(
      makeAuthedReq({
        body: {
          title: 'Qui gagne ?',
          outcomes: ['A', 'B'],
          prediction_window: 120,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { code?: string }).code).toBe('MISSING_SCOPE');
  });

  it('400 on invalid payload (single outcome)', async () => {
    seedConnection();
    const res = makeRes();
    await predictionsHandler(
      makeAuthedReq({
        body: { title: 'x', outcomes: ['A'], prediction_window: 120 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });
});

/* ===========================================================
 * PATCH /api/admin/twitch/predictions/[id]
 * =========================================================*/

describe('PATCH /api/admin/twitch/predictions/[id]', () => {
  it('400 when status=RESOLVED without winning_outcome_id', async () => {
    seedConnection();
    const res = makeRes();
    await predictionPatchHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: 'pred-1' },
        body: { status: 'RESOLVED' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('200 resolves with winning_outcome_id (mocked Helix)', async () => {
    seedConnection();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'pred-1', status: 'RESOLVED' }],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = makeRes();
    await predictionPatchHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: 'pred-1' },
        body: { status: 'RESOLVED', winning_outcome_id: 'o1' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/helix/predictions');
    expect(init.method).toBe('PATCH');
    const sent = JSON.parse(init.body as string);
    expect(sent.status).toBe('RESOLVED');
    expect(sent.winning_outcome_id).toBe('o1');
    expect(sent.id).toBe('pred-1');
  });

  it('409 NOT_CONNECTED when no connection', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const res = makeRes();
    await predictionPatchHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: 'pred-1' },
        body: { status: 'LOCKED' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('NOT_CONNECTED');
  });
});
