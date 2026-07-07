// tests/unit/publicWriteApi.test.ts
//
// Unit tests for `utils/publicWriteApi.ts` — the write middleware for the
// authenticated public API (`withPublicWrite`) plus the token resolvers
// (`resolveApiTokenFromHeader` / `verifyPublicApiToken`).
//
// Covers: method gate (405 + Allow), missing/invalid Authorization (401),
// valid token missing required scope (403 INSUFFICIENT_SCOPE), revoked token
// (401), happy path (handler runs with ctx.token/input/query), and idempotency
// replay (same Idempotency-Key replays the cached 2xx from `bot_idempotency`,
// keys prefixed `pub:`).

import crypto from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  withPublicWrite,
  verifyPublicApiToken,
  resolveApiTokenFromHeader,
} from '../../utils/publicWriteApi';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const PLAIN_TOKEN = 'pk_live_deadbeefcafebabe0123456789abcdef';

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Seed a `tenant_api_tokens` row. Returns the plaintext token to send in the
 * Authorization header.
 */
function seedToken(
  over: Partial<{
    id: string;
    tenant_id: string;
    scopes: string[];
    revoked_at: string | null;
    plain: string;
  }> = {}
): string {
  const plain = over.plain ?? PLAIN_TOKEN;
  (store.tenant_api_tokens ||= []).push({
    id: over.id ?? 'tok-1',
    tenant_id: over.tenant_id ?? TENANT,
    token_hash: sha256Hex(plain),
    token_prefix: plain.slice(0, 16),
    name: 'test token',
    scopes: over.scopes ?? ['matches:write'],
    revoked_at: over.revoked_at ?? null,
  });
  return plain;
}

let ipCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  ipCounter += 1;
  return {
    method: 'POST',
    url: '/api/public/v1/thing',
    headers: { host: 'h', 'x-real-ip': `10.1.0.${ipCounter % 250}` },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: `10.1.0.${ipCounter % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    headersSent: false,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    res.headersSent = true;
    return res;
  };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => {
    res.headersSent = true;
    return res;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  ipCounter = 0;
});

/* ------------------------------------------------------------------ *
 * resolveApiTokenFromHeader / verifyPublicApiToken
 * ------------------------------------------------------------------ */

describe('resolveApiTokenFromHeader', () => {
  it('resolves a valid Bearer pk_live_ token to { tenantId, scopes }', async () => {
    const plain = seedToken({ scopes: ['matches:read', 'matches:write'] });
    const result = await resolveApiTokenFromHeader(`Bearer ${plain}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.tenantId).toBe(TENANT);
      expect(result.token.scopes).toEqual(['matches:read', 'matches:write']);
      expect(result.token.id).toBe('tok-1');
    }
  });

  it('rejects a missing / malformed / non-pk_live header', async () => {
    seedToken();
    expect((await resolveApiTokenFromHeader(undefined)).ok).toBe(false);
    expect((await resolveApiTokenFromHeader('')).ok).toBe(false);
    expect((await resolveApiTokenFromHeader('Basic abc')).ok).toBe(false);
    expect((await resolveApiTokenFromHeader('Bearer ')).ok).toBe(false);
    expect((await resolveApiTokenFromHeader('Bearer sk_live_x')).ok).toBe(false);
  });

  it('rejects an unknown token (no matching hash)', async () => {
    seedToken();
    const result = await resolveApiTokenFromHeader('Bearer pk_live_totally_wrong');
    expect(result.ok).toBe(false);
  });

  it('rejects a revoked token', async () => {
    const plain = seedToken({ revoked_at: '2026-01-01T00:00:00.000Z' });
    const result = await resolveApiTokenFromHeader(`Bearer ${plain}`);
    expect(result.ok).toBe(false);
  });

  it('verifyPublicApiToken reads the header off a NextApiRequest', async () => {
    const plain = seedToken();
    const req = makeReq({ headers: { authorization: `Bearer ${plain}` } });
    const result = await verifyPublicApiToken(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.tenantId).toBe(TENANT);
  });
});

/* ------------------------------------------------------------------ *
 * withPublicWrite — method + auth + scope gates
 * ------------------------------------------------------------------ */

const OPTS = {
  methods: ['POST'] as const,
  scope: 'matches:write' as const,
  rateLimit: { max: 30, key: 'test-write' },
};

describe('withPublicWrite gates', () => {
  it('405 + Allow header on a disallowed method', async () => {
    const handler = vi.fn();
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
    expect((res.body as any).code).toBe('METHOD_NOT_ALLOWED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('401 UNAUTHORIZED when the Authorization header is missing', async () => {
    const handler = vi.fn();
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({ headers: { host: 'h' } });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(401);
    expect((res.body as any).code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('401 UNAUTHORIZED on an invalid token', async () => {
    const handler = vi.fn();
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({
      headers: { host: 'h', authorization: 'Bearer pk_live_nope' },
    });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(401);
    expect((res.body as any).code).toBe('UNAUTHORIZED');
  });

  it('401 UNAUTHORIZED on a revoked token', async () => {
    const plain = seedToken({ revoked_at: '2026-01-01T00:00:00.000Z' });
    const handler = vi.fn();
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({ headers: { host: 'h', authorization: `Bearer ${plain}` } });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(401);
    expect((res.body as any).code).toBe('UNAUTHORIZED');
  });

  it('403 INSUFFICIENT_SCOPE when the token lacks the required scope', async () => {
    const plain = seedToken({ scopes: ['matches:read'] });
    const handler = vi.fn();
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({ headers: { host: 'h', authorization: `Bearer ${plain}` } });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('INSUFFICIENT_SCOPE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('happy path: runs the handler with ctx.token / ctx.input / ctx.query', async () => {
    const plain = seedToken({ scopes: ['matches:write'] });
    const seen: any = {};
    const handler = vi.fn(async (_req, res, ctx) => {
      seen.token = ctx.token;
      seen.input = ctx.input;
      seen.query = ctx.query;
      res.status(200).json({ data: { ok: true } });
    });
    const route = withPublicWrite(handler, OPTS);
    const req = makeReq({
      headers: { host: 'h', authorization: `Bearer ${plain}` },
      body: { team1Score: 2, team2Score: 1 },
      query: { id: 'abc' },
    });
    const res = makeRes();
    await route(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).data).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(seen.token.tenantId).toBe(TENANT);
    expect(seen.token.scopes).toEqual(['matches:write']);
    expect(seen.input).toEqual({ team1Score: 2, team2Score: 1 });
    expect(seen.query).toEqual({ id: 'abc' });
    // no-store cache posture
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});

/* ------------------------------------------------------------------ *
 * withPublicWrite — idempotency replay
 * ------------------------------------------------------------------ */

describe('withPublicWrite idempotency', () => {
  const IDEM_OPTS = { ...OPTS, idempotent: true };

  it('replays the cached 2xx for the same Idempotency-Key and does not re-run the handler', async () => {
    const plain = seedToken({ scopes: ['matches:write'] });
    let calls = 0;
    const handler = vi.fn(async (_req, res) => {
      calls += 1;
      res.status(200).json({ data: { n: calls } });
    });
    const route = withPublicWrite(handler, IDEM_OPTS);

    const headers = {
      host: 'h',
      authorization: `Bearer ${plain}`,
      'idempotency-key': 'key-abc-123',
    };
    const body = { team1Score: 3, team2Score: 0 };

    // First call — handler runs, writes into bot_idempotency (pub: prefixed).
    const req1 = makeReq({ headers, body });
    const res1 = makeRes();
    await route(req1, res1);
    expect(res1.statusCode).toBe(200);
    expect((res1.body as any).data).toEqual({ n: 1 });
    expect(res1.headers['Idempotency-Replay']).toBeUndefined();

    // The cache row was persisted under the token's tenant with a `pub:` key.
    expect(store.bot_idempotency).toBeDefined();
    expect(store.bot_idempotency).toHaveLength(1);
    const cached = store.bot_idempotency[0];
    expect(cached.tenant_id).toBe(TENANT);
    expect(String(cached.cache_key)).toMatch(/^pub:/);
    expect(cached.status).toBe(200);

    // Second call — same key + same body → replay, handler NOT re-invoked.
    const req2 = makeReq({ headers, body });
    const res2 = makeRes();
    await route(req2, res2);
    expect(res2.statusCode).toBe(200);
    expect((res2.body as any).data).toEqual({ n: 1 });
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    expect(calls).toBe(1);
  });

  it('does NOT replay when the same key is reused with a different body', async () => {
    const plain = seedToken({ scopes: ['matches:write'] });
    let calls = 0;
    const handler = vi.fn(async (_req, res) => {
      calls += 1;
      res.status(200).json({ data: { n: calls } });
    });
    const route = withPublicWrite(handler, IDEM_OPTS);
    const baseHeaders = {
      host: 'h',
      authorization: `Bearer ${plain}`,
      'idempotency-key': 'same-key',
    };

    await route(makeReq({ headers: baseHeaders, body: { a: 1 } }), makeRes());
    const res2 = makeRes();
    await route(makeReq({ headers: baseHeaders, body: { a: 2 } }), res2);

    // Different body hash → new cache key → handler ran again.
    expect(calls).toBe(2);
    expect((res2.body as any).data).toEqual({ n: 2 });
    expect(res2.headers['Idempotency-Replay']).toBeUndefined();
  });
});
