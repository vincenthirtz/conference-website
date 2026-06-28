// Unit tests for pages/api/player/push/subscribe.ts AND unsubscribe.ts
//
// subscribe   (POST)   : upsert a Web Push subscription by endpoint.
//                        201 + created:true on first insert, 200 + created:false
//                        on a repeat (idempotent by endpoint).
// unsubscribe (DELETE) : delete the current user's subscription by endpoint;
//                        204 on success, 404 when nothing matched (no leak).
//
// supabase + rateLimit are auto-mocked by tests/unit/__helpers__/testSetup.ts.
// Fresh Bearer token per call defeats the 60s token→user cache in utils/staff.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import subscribeHandler from '@/pages/api/player/push/subscribe';
import unsubscribeHandler from '@/pages/api/player/push/unsubscribe';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const ENDPOINT = 'https://push.example.test/abc123';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(method: string, over: Partial<any> = {}): any {
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
    ended: false,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => ((res.ended = true), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const validSubscriptionBody = () => ({
  subscription: {
    endpoint: ENDPOINT,
    keys: { p256dh: 'p256dh-key-material', auth: 'auth-secret' },
  },
  user_agent: 'Mozilla/5.0 (Test)',
});

describe('POST /api/player/push/subscribe', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('201 + created:true on first subscribe (insert path)', async () => {
    const req = makeReq('POST', { body: validSubscriptionBody() });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(201);
    const body = res.body as { endpoint: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.endpoint).toBe(ENDPOINT);

    // Row persisted for this user.
    expect(
      (store.push_subscriptions ?? []).some(
        (r) => r.endpoint === ENDPOINT && r.user_id === USER_ID
      )
    ).toBe(true);
  });

  it('200 + created:false on repeat subscribe with same endpoint (idempotent update path)', async () => {
    store.push_subscriptions = [
      {
        id: 'existing-sub',
        user_id: OTHER_USER_ID,
        endpoint: ENDPOINT,
        p256dh: 'old',
        auth: 'old',
      },
    ];

    const req = makeReq('POST', { body: validSubscriptionBody() });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { id: string; created: boolean };
    expect(body.created).toBe(false);
    expect(body.id).toBe('existing-sub');

    // Endpoint stays unique (no duplicate row inserted) and the row was
    // re-bound to the current user with refreshed keys.
    const rows = (store.push_subscriptions ?? []).filter(
      (r) => r.endpoint === ENDPOINT
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_ID);
    expect(rows[0].p256dh).toBe('p256dh-key-material');
  });

  it('400 on a malformed subscription payload (bad endpoint URL)', async () => {
    const req = makeReq('POST', {
      body: {
        subscription: {
          endpoint: 'not-a-url',
          keys: { p256dh: 'k', auth: 'a' },
        },
      },
    });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });

  it('400 when keys are missing entirely', async () => {
    const req = makeReq('POST', {
      body: { subscription: { endpoint: ENDPOINT } },
    });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    resetSupabaseMock();
    const req = makeReq('POST', {
      headers: { host: 'h' },
      body: validSubscriptionBody(),
    });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('405 on a non-POST method', async () => {
    const req = makeReq('GET', { body: validSubscriptionBody() });
    const res = makeRes();
    await subscribeHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });
});

describe('DELETE /api/player/push/unsubscribe', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('204 and removes the row on success', async () => {
    store.push_subscriptions = [
      { id: 'sub-1', user_id: USER_ID, endpoint: ENDPOINT },
    ];

    const req = makeReq('DELETE', { body: { endpoint: ENDPOINT } });
    const res = makeRes();
    await unsubscribeHandler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(
      (store.push_subscriptions ?? []).some((r) => r.endpoint === ENDPOINT)
    ).toBe(false);
  });

  it('404 when the endpoint is not found for this user', async () => {
    // Row exists but belongs to another user → must look like "not found".
    store.push_subscriptions = [
      { id: 'sub-1', user_id: OTHER_USER_ID, endpoint: ENDPOINT },
    ];

    const req = makeReq('DELETE', { body: { endpoint: ENDPOINT } });
    const res = makeRes();
    await unsubscribeHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe('SUBSCRIPTION_NOT_FOUND');
    // The other user's row must NOT be deleted.
    expect(
      (store.push_subscriptions ?? []).some(
        (r) => r.user_id === OTHER_USER_ID && r.endpoint === ENDPOINT
      )
    ).toBe(true);
  });

  it('400 on a malformed payload (missing endpoint)', async () => {
    const req = makeReq('DELETE', { body: {} });
    const res = makeRes();
    await unsubscribeHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });

  it('401 when unauthenticated', async () => {
    resetSupabaseMock();
    const req = makeReq('DELETE', {
      headers: { host: 'h' },
      body: { endpoint: ENDPOINT },
    });
    const res = makeRes();
    await unsubscribeHandler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('405 on a non-DELETE method', async () => {
    const req = makeReq('POST', { body: { endpoint: ENDPOINT } });
    const res = makeRes();
    await unsubscribeHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('DELETE');
  });
});
