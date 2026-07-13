// Unit tests for pages/api/player/push/prefs.ts (channel-aware).
//
// GET → returns `{ push: {...}, email: {...} }`:
//        - push covers PLAYER_PUSH_EVENT_TYPES, OPT-OUT default (absent → true).
//        - email covers EMAIL_EVENT_TYPES, OPT-IN default (absent → false).
// PUT → body `{ eventType, channel, enabled }`. Validates eventType ∈ the
//        channel's whitelist; persists only non-default rows (push opt-out,
//        email opt-in), removes the row when returning to default.
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

import {
  PLAYER_PUSH_EVENT_TYPES,
  EMAIL_EVENT_TYPES,
  BROADCAST_OPT_OUT_EVENT_TYPE,
} from '@/utils/webPushEvents';

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
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

type PrefsBody = {
  push: Record<string, boolean>;
  email: Record<string, boolean>;
  broadcastEmail: boolean;
};

describe('GET /api/player/push/prefs (channel-aware)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('defaults push to enabled and email to disabled when no rows exist', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as PrefsBody;

    // push covers exactly PLAYER_PUSH_EVENT_TYPES, all true (opt-out default).
    expect(Object.keys(body.push).sort()).toEqual(
      [...PLAYER_PUSH_EVENT_TYPES].sort()
    );
    expect(Object.values(body.push).every((v) => v === true)).toBe(true);

    // email covers exactly EMAIL_EVENT_TYPES, all false (opt-in default).
    expect(Object.keys(body.email).sort()).toEqual(
      [...EMAIL_EVENT_TYPES].sort()
    );
    expect(Object.values(body.email).every((v) => v === false)).toBe(true);
  });

  it('reflects a push opt-out row (enabled=false)', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'scrim.invitation',
        channel: 'push',
        enabled: false,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const body = res.body as PrefsBody;
    expect(body.push['scrim.invitation']).toBe(false);
    // Other push types remain enabled by default.
    expect(
      Object.entries(body.push)
        .filter(([k]) => k !== 'scrim.invitation')
        .every(([, v]) => v === true)
    ).toBe(true);
  });

  it('reflects an email opt-in row (enabled=true)', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'match.starting',
        channel: 'email',
        enabled: true,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const body = res.body as PrefsBody;
    expect(body.email['match.starting']).toBe(true);
    // Other email types remain disabled (opt-in) by default.
    expect(
      Object.entries(body.email)
        .filter(([k]) => k !== 'match.starting')
        .every(([, v]) => v === false)
    ).toBe(true);
  });

  it('a push row does not leak into the email channel and vice-versa', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'match.starting',
        channel: 'push',
        enabled: false,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const body = res.body as PrefsBody;
    expect(body.push['match.starting']).toBe(false);
    // The email channel must still see its default (opt-in → false).
    expect(body.email['match.starting']).toBe(false);
  });

  it('ignores rows for another user', async () => {
    store.notification_prefs = [
      {
        user_id: 'other-user',
        event_type: 'match.starting',
        channel: 'push',
        enabled: false,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const body = res.body as PrefsBody;
    expect(body.push['match.starting']).toBe(true);
  });
});

describe('PUT /api/player/push/prefs (channel-aware)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('400s when channel is invalid', async () => {
    const req = makeReq({
      method: 'PUT',
      body: { eventType: 'match.starting', channel: 'sms', enabled: true },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });

  it('400s when eventType is outside the push whitelist', async () => {
    const req = makeReq({
      method: 'PUT',
      body: {
        // Valid WebPush type but NOT in PLAYER_PUSH_EVENT_TYPES.
        eventType: 'staff.role.changed',
        channel: 'push',
        enabled: false,
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_EVENT_TYPE');
  });

  it('400s when eventType is outside the email whitelist', async () => {
    const req = makeReq({
      method: 'PUT',
      body: {
        // In PLAYER_PUSH but NOT in EMAIL_EVENT_TYPES.
        eventType: 'scrim.invitation',
        channel: 'email',
        enabled: true,
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_EVENT_TYPE');
  });

  it('persists a push opt-out and a subsequent GET reflects it', async () => {
    const putReq = makeReq({
      method: 'PUT',
      body: {
        eventType: 'scrim.invitation',
        channel: 'push',
        enabled: false,
      },
    });
    const putRes = makeRes();
    await handler(putReq, putRes);

    expect(putRes.statusCode).toBe(200);
    expect((putRes.body as PrefsBody).push['scrim.invitation']).toBe(false);

    // A persisted opt-out row must exist (channel='push').
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'scrim.invitation' &&
          r.channel === 'push' &&
          r.enabled === false
      )
    ).toBe(true);

    const getReq = makeReq({ method: 'GET' });
    const getRes = makeRes();
    await handler(getReq, getRes);
    expect((getRes.body as PrefsBody).push['scrim.invitation']).toBe(false);
  });

  it('persists an email opt-in (enabled=true is non-default for email)', async () => {
    const putReq = makeReq({
      method: 'PUT',
      body: {
        eventType: 'news.published',
        channel: 'email',
        enabled: true,
      },
    });
    const putRes = makeRes();
    await handler(putReq, putRes);

    expect(putRes.statusCode).toBe(200);
    expect((putRes.body as PrefsBody).email['news.published']).toBe(true);

    // The opt-in row must be persisted with channel='email', enabled=true.
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'news.published' &&
          r.channel === 'email' &&
          r.enabled === true
      )
    ).toBe(true);
  });

  it('returning push to default (enabled=true) removes the opt-out row', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'team.forfeit',
        channel: 'push',
        enabled: false,
      },
    ];

    const req = makeReq({
      method: 'PUT',
      body: { eventType: 'team.forfeit', channel: 'push', enabled: true },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // Re-enable push = delete the row, never persist an enabled=true push row.
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'team.forfeit' &&
          r.channel === 'push'
      )
    ).toBe(false);
    expect((res.body as PrefsBody).push['team.forfeit']).toBe(true);
  });

  it('returning email to default (enabled=false) removes the opt-in row', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'news.published',
        channel: 'email',
        enabled: true,
      },
    ];

    const req = makeReq({
      method: 'PUT',
      body: { eventType: 'news.published', channel: 'email', enabled: false },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // Opt-out of email = delete the row, never persist an enabled=false email row.
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'news.published' &&
          r.channel === 'email'
      )
    ).toBe(false);
    expect((res.body as PrefsBody).email['news.published']).toBe(false);
  });
});

describe('broadcastEmail (opt-out RGPD, top-level field)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('GET defaults broadcastEmail to true when no opt-out row exists', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as PrefsBody).broadcastEmail).toBe(true);
  });

  it('GET returns broadcastEmail=false when the opt-out row exists', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: false,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    const body = res.body as PrefsBody;
    expect(body.broadcastEmail).toBe(false);
    // The broadcast sentinel must NOT leak into the email event-type map.
    expect(
      Object.prototype.hasOwnProperty.call(
        body.email,
        BROADCAST_OPT_OUT_EVENT_TYPE
      )
    ).toBe(false);
    // Existing email opt-in defaults stay untouched.
    expect(Object.values(body.email).every((v) => v === false)).toBe(true);
  });

  it('ignores a broadcast opt-out row belonging to another user', async () => {
    store.notification_prefs = [
      {
        user_id: 'other-user',
        event_type: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: false,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);

    expect((res.body as PrefsBody).broadcastEmail).toBe(true);
  });

  it('PUT {broadcast, email, false} inserts the opt-out row and flips broadcastEmail to false', async () => {
    const putReq = makeReq({
      method: 'PUT',
      body: {
        eventType: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: false,
      },
    });
    const putRes = makeRes();
    await handler(putReq, putRes);

    expect(putRes.statusCode).toBe(200);
    expect((putRes.body as PrefsBody).broadcastEmail).toBe(false);

    // The opt-out row (broadcast, email, false) must be persisted — this is the
    // exact row read by utils/broadcasts::computeAudienceRecipients.
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE &&
          r.channel === 'email' &&
          r.enabled === false
      )
    ).toBe(true);

    const getReq = makeReq({ method: 'GET' });
    const getRes = makeRes();
    await handler(getReq, getRes);
    expect((getRes.body as PrefsBody).broadcastEmail).toBe(false);
  });

  it('PUT {broadcast, email, true} deletes the opt-out row and restores broadcastEmail to true', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: false,
      },
    ];

    const req = makeReq({
      method: 'PUT',
      body: {
        eventType: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: true,
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as PrefsBody).broadcastEmail).toBe(true);
    // Re-subscribing = default = no row persisted (never an enabled=true row).
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE &&
          r.channel === 'email'
      )
    ).toBe(false);
  });

  it('broadcast opt-out does not touch push/email event-type prefs', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'news.published',
        channel: 'email',
        enabled: true,
      },
      {
        user_id: USER_ID,
        event_type: 'team.forfeit',
        channel: 'push',
        enabled: false,
      },
    ];

    const putReq = makeReq({
      method: 'PUT',
      body: {
        eventType: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'email',
        enabled: false,
      },
    });
    const putRes = makeRes();
    await handler(putReq, putRes);

    const body = putRes.body as PrefsBody;
    expect(body.broadcastEmail).toBe(false);
    // Pre-existing per-event prefs are preserved through the broadcast mutation.
    expect(body.email['news.published']).toBe(true);
    expect(body.push['team.forfeit']).toBe(false);
    expect(
      (store.notification_prefs ?? []).some(
        (r) =>
          r.user_id === USER_ID &&
          r.event_type === 'news.published' &&
          r.channel === 'email' &&
          r.enabled === true
      )
    ).toBe(true);
  });

  it('rejects the broadcast sentinel on the push channel (INVALID_EVENT_TYPE)', async () => {
    const req = makeReq({
      method: 'PUT',
      body: {
        eventType: BROADCAST_OPT_OUT_EVENT_TYPE,
        channel: 'push',
        enabled: false,
      },
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_EVENT_TYPE');
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
