// tests/unit/twitchAdminConnection.test.ts
//
// Routes Twitch admin sans test avant leur migration vers features/admin/twitch :
//   - /api/admin/twitch/connection (GET caster+, DELETE admin+) — le statut ne
//     rend JAMAIS les jetons, même chiffrés ;
//   - /api/admin/twitch/eventsub/alerts et /eventsub/tcg-drop — préalables
//     (Twitch non configuré, chaîne non connectée).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

process.env.TWITCH_TOKEN_ENC_KEY = 'test-enc-key-please-change';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { encryptSecret } from '../../utils/crypto';

import connectionHandler from '../../pages/api/admin/twitch/connection';
import alertsHandler from '../../pages/api/admin/twitch/eventsub/alerts';
import tcgDropHandler from '../../pages/api/admin/twitch/eventsub/tcg-drop';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

function staffRow(role: 'owner' | 'admin' | 'caster'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 's@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-conn-${n}` },
    query: {},
    body: {},
    cookies: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

function seedConnection() {
  store.twitch_broadcaster_connections = [
    {
      tenant_id: TENANT_X,
      broadcaster_id: 'bc-123',
      broadcaster_login: 'mychannel',
      access_token_enc: encryptSecret('live-access-token'),
      refresh_token_enc: encryptSecret('live-refresh-token'),
      scope: ['clips:edit'],
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      connected_by_user_id: 'user-1',
    },
  ] as any;
}

const savedClientId = process.env.TWITCH_CLIENT_ID;
const savedClientSecret = process.env.TWITCH_CLIENT_SECRET;

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
  logStaffActionMock.mockClear();
});

afterEach(() => {
  process.env.TWITCH_CLIENT_ID = savedClientId;
  process.env.TWITCH_CLIENT_SECRET = savedClientSecret;
  vi.restoreAllMocks();
});

describe('/api/admin/twitch/connection', () => {
  it('GET sans connexion → { connected: false }', async () => {
    const res = makeRes();
    await connectionHandler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  it('GET (caster) → statut, sans aucun jeton', async () => {
    store.staff = [staffRow('caster')] as any;
    seedConnection();
    const res = makeRes();
    await connectionHandler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      connected: true,
      broadcaster_login: 'mychannel',
      scope: ['clips:edit'],
    });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('live-access-token');
  });

  it('DELETE refusé au caster (403), rien supprimé', async () => {
    store.staff = [staffRow('caster')] as any;
    seedConnection();
    const res = makeRes();
    await connectionHandler(req({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(403);
    expect(store.twitch_broadcaster_connections).toHaveLength(1);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('DELETE (admin) → déconnecte et journalise sans jeton', async () => {
    seedConnection();
    const res = makeRes();
    await connectionHandler(req({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connected: false });
    expect(store.twitch_broadcaster_connections).toHaveLength(0);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const entry = (logStaffActionMock.mock.calls[0] as unknown[])[0] as {
      action: string;
      payload: unknown;
    };
    expect(entry.action).toBe('disconnect_twitch_broadcaster');
    expect(entry.payload).toEqual({ action: 'disconnect_twitch_broadcaster' });
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = makeRes();
    await connectionHandler(req({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET,DELETE');
  });
});

describe('/api/admin/twitch/eventsub/alerts', () => {
  it('503 TWITCH_NOT_CONFIGURED sans identifiants client', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    const res = makeRes();
    await alertsHandler(req(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('TWITCH_NOT_CONFIGURED');
  });

  it('409 NOT_CONNECTED sans chaîne connectée', async () => {
    process.env.TWITCH_CLIENT_ID = 'cid';
    process.env.TWITCH_CLIENT_SECRET = 'csecret';
    const res = makeRes();
    await alertsHandler(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_CONNECTED');
  });
});

describe('/api/admin/twitch/eventsub/tcg-drop', () => {
  it('503 TWITCH_NOT_CONFIGURED sans client id', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    const res = makeRes();
    await tcgDropHandler(req(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('TWITCH_NOT_CONFIGURED');
  });

  it('409 NOT_CONNECTED sans chaîne connectée', async () => {
    process.env.TWITCH_CLIENT_ID = 'cid';
    const res = makeRes();
    await tcgDropHandler(req({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_CONNECTED');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});
