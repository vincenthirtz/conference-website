// tests/unit/apiPublicV1MatchResult.test.ts
//
// Unit tests for the pilot public-write endpoint
// `POST /api/public/v1/matches/{id}/result`. A scoped `matches:write` token
// posts a final score directly (token = authority, no consensus needed).
//
// `applyMatchScore` is mocked (its bracket/discord/rating machinery is covered
// by its own suites) so these tests focus on the endpoint's pre-checks and
// response envelope: 404 unknown match, 409 already-finished, 400 bye /
// incomplete, and the happy path that delegates to applyMatchScore.

import crypto from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { applyMatchScore } = vi.hoisted(() => ({
  applyMatchScore: vi.fn(async (_input: any) => ({
    matchId: _input.matchId,
    updated: true,
    match: {},
    winnerTeamId: '33333333-3333-4333-8333-333333330001',
  })),
}));
vi.mock('@/utils/matches/applyScore', () => ({ applyMatchScore }));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/public/v1/matches/[id]/result';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM1 = '33333333-3333-4333-8333-333333330001';
const TEAM2 = '33333333-3333-4333-8333-333333330002';
const PLAIN_TOKEN = 'pk_live_deadbeefcafebabe0123456789abcdef';

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function seedToken(
  scopes: string[] = ['matches:write'],
  plan: {
    plan?: string;
    plan_status?: string;
    plan_expires_at?: string | null;
  } = {}
): string {
  (store.tenant_api_tokens ||= []).push({
    id: 'tok-1',
    tenant_id: TENANT,
    token_hash: sha256Hex(PLAIN_TOKEN),
    token_prefix: PLAIN_TOKEN.slice(0, 16),
    name: 'test',
    scopes,
    revoked_at: null,
  });
  // Seed the owning tenant with a billing plan so the API PLAN gate resolves.
  // Default `foundation` = full access (does not perturb pre-gate assertions).
  const tenants = (store.tenants ||= []);
  if (!tenants.some((r) => r.id === TENANT)) {
    tenants.push({
      id: TENANT,
      plan: plan.plan ?? 'foundation',
      plan_status: plan.plan_status ?? 'active',
      plan_expires_at: plan.plan_expires_at ?? null,
    });
  }
  return PLAIN_TOKEN;
}

function seedMatch(over: Record<string, unknown> = {}) {
  (store.matches ||= []).push({
    id: MATCH,
    tenant_id: TENANT,
    status: 'ongoing',
    is_bye: false,
    team1_id: TEAM1,
    team2_id: TEAM2,
    ...over,
  });
}

let ipCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  ipCounter += 1;
  return {
    method: 'POST',
    url: `/api/public/v1/matches/${MATCH}/result`,
    headers: {
      host: 'h',
      'x-real-ip': `10.2.0.${ipCounter % 250}`,
      authorization: `Bearer ${PLAIN_TOKEN}`,
    },
    query: { id: MATCH },
    body: { team1Score: 2, team2Score: 1 },
    cookies: {},
    socket: { remoteAddress: `10.2.0.${ipCounter % 250}` },
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
  applyMatchScore.mockClear();
  ipCounter = 0;
});

describe('POST /api/public/v1/matches/{id}/result', () => {
  it('401 without a token (middleware auth gate)', async () => {
    seedMatch();
    const req = makeReq({ headers: { host: 'h' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('403 when the token lacks matches:write', async () => {
    seedToken(['matches:read']);
    seedMatch();
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).code).toBe('INSUFFICIENT_SCOPE');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('400 on a non-UUID match id (query schema)', async () => {
    seedToken();
    const req = makeReq({ query: { id: 'not-a-uuid' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_QUERY');
  });

  it('400 on invalid scores (body schema)', async () => {
    seedToken();
    seedMatch();
    const req = makeReq({ body: { team1Score: -1, team2Score: 1 } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('404 when the match is unknown', async () => {
    seedToken();
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('NOT_FOUND');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('409 when the match is already finished', async () => {
    seedToken();
    seedMatch({ status: 'finished' });
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CONFLICT');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('400 when the match is a bye', async () => {
    seedToken();
    seedMatch({ is_bye: true });
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BAD_REQUEST');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('happy path: delegates to applyMatchScore and returns the finished payload', async () => {
    seedToken();
    seedMatch();
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
    expect(applyMatchScore).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        matchId: MATCH,
        team1Score: 2,
        team2Score: 1,
        markFinished: true,
        staffId: null,
        propagateBracket: true,
      })
    );
    expect((res.body as any).data).toEqual({
      matchId: MATCH,
      status: 'finished',
      team1Score: 2,
      team2Score: 1,
      winnerTeamId: TEAM1,
    });
  });
});
