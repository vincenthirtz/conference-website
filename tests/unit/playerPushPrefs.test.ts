// Unit tests for pages/api/player/push/prefs.ts
//
// GET  → returns every PLAYER_PUSH_EVENT_TYPES entry, defaulting to enabled
//        when no `notification_prefs` row exists (the "row-absent = enabled"
//        opt-out model).
// PUT  → validates event_type against the player enum, persists opt-outs as
//        rows (and removes rows for re-enables), then echoes the merged state.
//
// supabase + rateLimit are auto-mocked by tests/unit/__helpers__/testSetup.ts.
// A fresh Bearer token per call defeats the 60s token→user cache in
// utils/staff.ts (otherwise setAuthUser changes would be masked by the cache).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { PLAYER_PUSH_EVENT_TYPES } from '@/utils/webPushEvents';

import handler from '@/pages/api/player/push/prefs';

const USER_ID = '11111111-1111-1111-1111-111111111111';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

type PrefRow = { event_type: string; enabled: boolean };

describe('GET /api/player/push/prefs', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('defaults every player event type to enabled when no rows exist', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const prefs = (res.body as { prefs: PrefRow[] }).prefs;
    // Exactly the player subset, all enabled.
    expect(prefs.map((p) => p.event_type).sort()).toEqual(
      [...PLAYER_PUSH_EVENT_TYPES].sort()
    );
    expect(prefs.every((p) => p.enabled === true)).toBe(true);
  });

  it('reflects an existing opt-out row (enabled=false)', async () => {
    store.notification_prefs = [
      { user_id: USER_ID, event_type: 'scrim.invitation', enabled: false },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const prefs = (res.body as { prefs: PrefRow[] }).prefs;
    const scrim = prefs.find((p) => p.event_type === 'scrim.invitation');
    expect(scrim?.enabled).toBe(false);
    // Other types remain enabled by default.
    expect(
      prefs
        .filter((p) => p.event_type !== 'scrim.invitation')
        .every((p) => p.enabled === true)
    ).toBe(true);
  });

  it('ignores rows for another user', async () => {
    store.notification_prefs = [
      { user_id: 'other-user', event_type: 'match.starting', enabled: false },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const prefs = (res.body as { prefs: PrefRow[] }).prefs;
    expect(prefs.find((p) => p.event_type === 'match.starting')?.enabled).toBe(
      true
    );
  });
});

describe('PUT /api/player/push/prefs', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('400s when an event_type is outside the player enum', async () => {
    const req = makeReq({
      method: 'PUT',
      body: {
        prefs: [
          // Valid WebPush type but NOT in PLAYER_PUSH_EVENT_TYPES.
          { event_type: 'staff.role.changed', enabled: false },
        ],
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });

  it('persists an opt-out and a subsequent GET reflects it', async () => {
    // 1) PUT: disable scrim.invitation.
    const putReq = makeReq({
      method: 'PUT',
      body: {
        prefs: [{ event_type: 'scrim.invitation', enabled: false }],
      },
    });
    const putRes = makeRes();
    await handler(putReq, putRes);

    expect(putRes.statusCode).toBe(200);
    const putPrefs = (putRes.body as { prefs: PrefRow[] }).prefs;
    expect(
      putPrefs.find((p) => p.event_type === 'scrim.invitation')?.enabled
    ).toBe(false);

    // A persisted opt-out row must exist for this user.
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'scrim.invitation' &&
          r.enabled === false
      )
    ).toBe(true);

    // 2) GET: the opt-out survives a fresh read.
    const getReq = makeReq({ method: 'GET' });
    const getRes = makeRes();
    await handler(getReq, getRes);

    const getPrefs = (getRes.body as { prefs: PrefRow[] }).prefs;
    expect(
      getPrefs.find((p) => p.event_type === 'scrim.invitation')?.enabled
    ).toBe(false);
  });

  it('re-enabling removes the opt-out row (no enabled=true rows persisted)', async () => {
    store.notification_prefs = [
      { user_id: USER_ID, event_type: 'team.forfeit', enabled: false },
    ];

    const req = makeReq({
      method: 'PUT',
      body: {
        prefs: [{ event_type: 'team.forfeit', enabled: true }],
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // Re-enable = delete the row, never insert an enabled=true row.
    expect(
      (store.notification_prefs ?? []).some(
        (r) => r.user_id === USER_ID && r.event_type === 'team.forfeit'
      )
    ).toBe(false);

    const prefs = (res.body as { prefs: PrefRow[] }).prefs;
    expect(prefs.find((p) => p.event_type === 'team.forfeit')?.enabled).toBe(
      true
    );
  });
});

describe('/api/player/push/prefs auth + method', () => {
  beforeEach(() => resetSupabaseMock());

  it('401s when unauthenticated (no Bearer token)', async () => {
    const req = makeReq({ method: 'GET', headers: { host: 'h' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('405s on an unsupported method', async () => {
    setAuthUser({ id: USER_ID });
    const req = makeReq({ method: 'DELETE' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET,PUT');
  });
});
