// tests/unit/apiOnboardSecrets.test.ts
//
// GET /api/onboard/secrets/[token]
//   - 400 token malformé
//   - 404 token inconnu
//   - 410 token déjà consommé
//   - 410 token expiré
//   - 200 happy path + wipe pending_secrets_reveal + stamp secrets_revealed_at

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/onboard/secrets/[token]';

const VALID_TOKEN = 'b'.repeat(64);
const REQUEST_ID = '33333333-3333-3333-3333-333333333333';
const TENANT_ID = '44444444-4444-4444-4444-444444444444';

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
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
});

function seed(overrides: Record<string, unknown> = {}) {
  store.tenant_requests = [
    {
      id: REQUEST_ID,
      created_tenant_id: TENANT_ID,
      requested_slug: 'my-org',
      requested_name: 'My Org',
      secrets_reveal_token: VALID_TOKEN,
      secrets_reveal_token_expires_at: new Date(
        Date.now() + 30 * 60 * 1000
      ).toISOString(),
      secrets_revealed_at: null,
      pending_secrets_reveal: {
        botApiKey: 'plain-api-key-aaaa',
        botWebhookSecret: 'plain-webhook-secret-bbbb',
      },
      ...overrides,
    },
  ];
}

describe('GET /api/onboard/secrets/[token]', () => {
  it('400 token malformé', async () => {
    const res = makeRes();
    await handler(makeReq({ token: 'short' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TOKEN');
  });

  it('404 si token inconnu', async () => {
    store.tenant_requests = [];
    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);
    expect(res.statusCode).toBe(404);
  });

  it('410 ALREADY_REVEALED si déjà consommé', async () => {
    seed({
      secrets_revealed_at: '2026-05-20T00:00:00Z',
      pending_secrets_reveal: null,
    });
    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);
    expect(res.statusCode).toBe(410);
    expect((res.body as any).code).toBe('ALREADY_REVEALED');
  });

  it('410 EXPIRED si token expiré', async () => {
    seed({
      secrets_reveal_token_expires_at: new Date(
        Date.now() - 60_000
      ).toISOString(),
    });
    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);
    expect(res.statusCode).toBe(410);
    expect((res.body as any).code).toBe('EXPIRED');
  });

  it('happy path : 200 + secrets + wipe', async () => {
    seed();
    const res = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe(TENANT_ID);
    expect(body.tenantSlug).toBe('my-org');
    expect(body.botApiKey).toBe('plain-api-key-aaaa');
    expect(body.botWebhookSecret).toBe('plain-webhook-secret-bbbb');
    expect(body.instructions.dotEnvSnippet).toContain('BOT_API_KEY=');

    const row = (store.tenant_requests ?? [])[0];
    expect(row.secrets_revealed_at).toBeTruthy();
    expect(row.pending_secrets_reveal).toBeNull();
  });

  it('410 sur 2e consultation (single-use)', async () => {
    seed();
    const res1 = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res1);
    expect(res1.statusCode).toBe(200);

    const res2 = makeRes();
    await handler(makeReq({ token: VALID_TOKEN }), res2);
    expect(res2.statusCode).toBe(410);
    expect((res2.body as any).code).toBe('ALREADY_REVEALED');
  });
});
