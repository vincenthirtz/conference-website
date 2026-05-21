// tests/unit/apiOnboardVerifyEmail.test.ts
//
// GET /api/onboard/verify-email?token=...
//   - 400 token absent / malformé
//   - 404 token inconnu
//   - 302 redirect happy path + row transitions to pending_bot_invite

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/onboard/verify-email';

const VALID_TOKEN = 'a'.repeat(64);
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';

function makeReq(query: Record<string, string>): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query,
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
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
  res.end = () => res;
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('GET /api/onboard/verify-email', () => {
  it('405 sur POST', async () => {
    const res = makeRes();
    await handler({ ...makeReq({}), method: 'POST' } as any, res);
    expect(res.statusCode).toBe(405);
  });

  it('400 si token manquant', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TOKEN');
  });

  it('400 si token malformé', async () => {
    const res = makeRes();
    await handler(makeReq({ token: 'not-hex' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TOKEN');
  });

  it('404 si token inconnu', async () => {
    store.tenant_requests = [];
    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('INVALID_OR_CONSUMED');
  });

  it('happy path : 302 redirect + status passe à pending_bot_invite', async () => {
    store.tenant_requests = [
      {
        id: REQUEST_ID,
        requested_slug: 'my-org',
        requested_name: 'My Org',
        status: 'pending_email_verification',
        email_verification_token: VALID_TOKEN,
        email_verified_at: null,
      },
    ];

    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toContain(`/onboard/invite-bot/${REQUEST_ID}`);

    const row = (store.tenant_requests ?? [])[0];
    expect(row.status).toBe('pending_bot_invite');
    expect(row.email_verification_token).toBeNull();
    expect(typeof row.email_verified_at).toBe('string');
  });

  it('404 si token déjà consommé (status != pending_email_verification)', async () => {
    store.tenant_requests = [
      {
        id: REQUEST_ID,
        requested_slug: 'my-org',
        requested_name: 'My Org',
        status: 'pending_bot_invite',
        email_verification_token: null,
        email_verified_at: '2026-05-21T00:00:00Z',
      },
    ];

    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);
    expect(res.statusCode).toBe(404);
  });
});
