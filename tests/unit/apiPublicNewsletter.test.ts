// tests/unit/apiPublicNewsletter.test.ts
//
// Public double opt-in newsletter API:
//   POST /api/public/newsletter/subscribe  (honeypot + captcha + rate limit)
//   GET  /api/public/newsletter/confirm?token=...
//
// Enumeration-safe: subscribe always answers 200 { success: true }. Confirm
// always redirects (302) — to /newsletter/merci on success, or
// /newsletter/merci?status=invalid otherwise.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Email module mock (mirrors broadcastNewSubscribers.test.ts) ------------
const { sendNewsletterConfirmEmail, buildNewsletterConfirmEmailHtml } =
  vi.hoisted(() => ({
    sendNewsletterConfirmEmail: vi.fn(
      async (): Promise<{ success: boolean; id?: string; error?: string }> => ({
        success: true,
      })
    ),
    buildNewsletterConfirmEmailHtml: vi.fn(
      (url: string) => `<html>confirm ${url}</html>`
    ),
  }));
vi.mock('@/utils/email', () => ({
  sendNewsletterConfirmEmail,
  buildNewsletterConfirmEmailHtml,
}));

// --- Captcha mock: always passing -------------------------------------------
vi.mock('@/utils/captcha', () => ({
  verifyCaptcha: vi.fn(() => ({ valid: true })),
}));

// --- Supabase mock ----------------------------------------------------------
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import subscribeHandler from '../../pages/api/public/newsletter/subscribe';
import confirmHandler from '../../pages/api/public/newsletter/confirm';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'example.com', 'x-real-ip': randomIp() },
    query: {},
    body: {},
    ...over,
  };
}

// Each request gets a fresh IP so the shared in-memory rate-limit bucket in
// utils/rateLimit doesn't bleed across test cases.
let _ipCounter = 0;
function randomIp(): string {
  _ipCounter += 1;
  return `10.0.${Math.floor(_ipCounter / 256)}.${_ipCounter % 256}`;
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    redirectLocation: undefined as string | undefined,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.redirect = (code: number, location: string) => {
    res.statusCode = code;
    res.redirectLocation = location;
    return res;
  };
  res.end = () => res;
  return res;
}

const validBody = (over: Record<string, unknown> = {}) => ({
  email: 'Fan@Example.com',
  captchaToken: 'tok',
  captchaAnswer: '4',
  ...over,
});

beforeEach(() => {
  resetSupabaseMock();
  store.newsletter_subscribers = [];
  sendNewsletterConfirmEmail.mockClear();
  sendNewsletterConfirmEmail.mockResolvedValue({ success: true });
});

describe('POST /api/public/newsletter/subscribe', () => {
  it('rejects non-POST with 405 + Allow', async () => {
    const res = makeRes();
    await subscribeHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });

  it('honeypot filled → generic 200 success, no row, no email', async () => {
    const res = makeRes();
    await subscribeHandler(
      makeReq({ body: validBody({ honeypot: 'i am a bot' }) }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(store.newsletter_subscribers).toHaveLength(0);
    expect(sendNewsletterConfirmEmail).not.toHaveBeenCalled();
  });

  it('invalid email → 400', async () => {
    const res = makeRes();
    await subscribeHandler(makeReq({ body: validBody({ email: 'nope' }) }), res);
    expect(res.statusCode).toBe(400);
  });

  it('new email → pending row created (lower-cased) + confirmation email attempted', async () => {
    const res = makeRes();
    await subscribeHandler(
      makeReq({ body: validBody({ source: 'footer' }) }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    const rows = store.newsletter_subscribers as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('fan@example.com'); // normalized
    expect(rows[0].status).toBe('pending');
    expect(rows[0].tenant_id).toBe(CONFERENCE_TENANT_ID);
    expect(rows[0].source).toBe('footer');
    expect(typeof rows[0].confirm_token).toBe('string');
    expect((rows[0].confirm_token as string).length).toBeGreaterThanOrEqual(32);

    expect(sendNewsletterConfirmEmail).toHaveBeenCalledTimes(1);
    const arg = (sendNewsletterConfirmEmail.mock.calls[0] as any[])[0] as any;
    expect(arg.to).toBe('fan@example.com');
    expect(arg.confirmUrl).toContain('/api/public/newsletter/confirm?token=');
    expect(arg.confirmUrl).toContain(rows[0].confirm_token);
  });

  it('already-confirmed subscriber → generic 200, no resend, row untouched', async () => {
    store.newsletter_subscribers = [
      {
        id: 'sub-1',
        tenant_id: CONFERENCE_TENANT_ID,
        email: 'fan@example.com',
        status: 'confirmed',
        confirm_token: null,
        confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    const res = makeRes();
    await subscribeHandler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sendNewsletterConfirmEmail).not.toHaveBeenCalled();

    const row = (store.newsletter_subscribers as any[])[0];
    expect(row.status).toBe('confirmed');
    expect(row.confirm_token).toBeNull();
  });

  it('previously unsubscribed → re-armed to pending with a fresh token + email', async () => {
    store.newsletter_subscribers = [
      {
        id: 'sub-2',
        tenant_id: CONFERENCE_TENANT_ID,
        email: 'fan@example.com',
        status: 'unsubscribed',
        confirm_token: null,
        unsubscribed_at: '2026-02-01T00:00:00.000Z',
      },
    ];

    const res = makeRes();
    await subscribeHandler(makeReq({ body: validBody() }), res);

    expect(res.statusCode).toBe(200);
    const row = (store.newsletter_subscribers as any[])[0];
    expect(row.id).toBe('sub-2'); // updated in place, not a new row
    expect(store.newsletter_subscribers).toHaveLength(1);
    expect(row.status).toBe('pending');
    expect(typeof row.confirm_token).toBe('string');
    expect(sendNewsletterConfirmEmail).toHaveBeenCalledTimes(1);
  });

  it('email send failure still yields generic 200 (no leak)', async () => {
    sendNewsletterConfirmEmail.mockResolvedValueOnce({
      success: false,
      error: 'brevo down',
    });
    const res = makeRes();
    await subscribeHandler(makeReq({ body: validBody() }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(store.newsletter_subscribers).toHaveLength(1);
  });
});

describe('GET /api/public/newsletter/confirm', () => {
  it('rejects non-GET with 405 + Allow', async () => {
    const res = makeRes();
    await confirmHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('valid token → status confirmed + redirect to /newsletter/merci', async () => {
    const token = 'a'.repeat(64);
    store.newsletter_subscribers = [
      {
        id: 'sub-3',
        tenant_id: CONFERENCE_TENANT_ID,
        email: 'fan@example.com',
        status: 'pending',
        confirm_token: token,
        confirmed_at: null,
      },
    ];

    const res = makeRes();
    await confirmHandler(makeReq({ method: 'GET', query: { token } }), res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectLocation).toBe('/newsletter/merci');

    const row = (store.newsletter_subscribers as any[])[0];
    expect(row.status).toBe('confirmed');
    expect(row.confirm_token).toBeNull();
    expect(typeof row.confirmed_at).toBe('string');
  });

  it('missing token → redirect ?status=invalid', async () => {
    const res = makeRes();
    await confirmHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(302);
    expect(res.redirectLocation).toBe('/newsletter/merci?status=invalid');
  });

  it('unknown token → redirect ?status=invalid', async () => {
    const res = makeRes();
    await confirmHandler(
      makeReq({ method: 'GET', query: { token: 'z'.repeat(64) } }),
      res
    );
    expect(res.statusCode).toBe(302);
    expect(res.redirectLocation).toBe('/newsletter/merci?status=invalid');
  });

  it('unsubscribed row → not re-confirmed, redirect ?status=invalid', async () => {
    const token = 'b'.repeat(64);
    store.newsletter_subscribers = [
      {
        id: 'sub-4',
        tenant_id: CONFERENCE_TENANT_ID,
        email: 'fan@example.com',
        status: 'unsubscribed',
        confirm_token: token,
      },
    ];
    const res = makeRes();
    await confirmHandler(makeReq({ method: 'GET', query: { token } }), res);
    expect(res.statusCode).toBe(302);
    expect(res.redirectLocation).toBe('/newsletter/merci?status=invalid');
    expect((store.newsletter_subscribers as any[])[0].status).toBe(
      'unsubscribed'
    );
  });
});
