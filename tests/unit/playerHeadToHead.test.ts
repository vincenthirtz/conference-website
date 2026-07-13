// Unit tests for pages/api/player/discovery/head-to-head.ts
//
// GET /api/player/discovery/head-to-head?opponentId=<uuid>
//
// Cross-tenant H2H : seeds match_participants / matches / player_discovery_profiles
// in the in-memory store and asserts the win/loss/draw tally AGGREGATES across
// two distinct tenant_ids. Also covers the privacy gate (404 NOT_DISCOVERABLE
// when the opponent isn't discoverable) and auth (401 without Bearer).
//
// supabase + rateLimit are auto-mocked by tests/unit/__helpers__/testSetup.ts.
// A fresh Bearer token per call defeats the 60s token→user cache in utils/staff.ts.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import handler from '@/pages/api/player/discovery/head-to-head';

const SELF_ID = '11111111-1111-4111-8111-111111111111';
const OPP_ID = '22222222-2222-4222-8222-222222222222';

const TENANT_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_2 = 'bbbbbbbb-0000-4000-8000-000000000002';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { opponentId: OPP_ID },
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

type H2HBody = {
  a: { userId: string };
  b: { userId: string };
  totals: { played: number; aWins: number; bWins: number; draws: number };
  recent: Array<{
    matchId: string;
    tenantId: string | null;
    winner: 'a' | 'b' | 'draw';
  }>;
};

/** Marks the opponent (and optionally others) as discoverable=true. */
function seedDiscoverable(...ids: string[]) {
  store.player_discovery_profiles = ids.map((id) => ({
    auth_user_id: id,
    discoverable: true,
  }));
}

/** Push a participant row for a player in a match. */
function part(
  tenantId: string,
  matchId: string,
  teamId: string,
  userId: string,
  isSub = false
) {
  (store.match_participants ||= []).push({
    tenant_id: tenantId,
    match_id: matchId,
    team_id: teamId,
    user_id: userId,
    is_substitute: isSub,
  });
}

/** Push a match row (winner_team_id null = draw / unresolved). */
function match(
  tenantId: string,
  id: string,
  winnerTeamId: string | null,
  completedAt: string
) {
  (store.matches ||= []).push({
    id,
    tenant_id: tenantId,
    tournament_id: null,
    winner_team_id: winnerTeamId,
    completed_at: completedAt,
  });
}

describe('GET /api/player/discovery/head-to-head (cross-tenant tally)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: SELF_ID });
    seedDiscoverable(OPP_ID);
  });

  it('aggregates wins/losses/draws across two different tenant_ids', async () => {
    // Tenant 1 — m1: A(T1a) vs B(T1b), winner T1a → A win.
    part(TENANT_1, 'm1', 'T1a', SELF_ID);
    part(TENANT_1, 'm1', 'T1b', OPP_ID);
    match(TENANT_1, 'm1', 'T1a', '2026-01-01T00:00:00Z');

    // Tenant 2 — m2: A(T2a) vs B(T2b), winner T2b → B win.
    part(TENANT_2, 'm2', 'T2a', SELF_ID);
    part(TENANT_2, 'm2', 'T2b', OPP_ID);
    match(TENANT_2, 'm2', 'T2b', '2026-02-01T00:00:00Z');

    // Tenant 2 — m3: A(T2a) vs B(T2b), no winner → draw.
    part(TENANT_2, 'm3', 'T2a', SELF_ID);
    part(TENANT_2, 'm3', 'T2b', OPP_ID);
    match(TENANT_2, 'm3', null, '2026-03-01T00:00:00Z');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as H2HBody;
    expect(body.a.userId).toBe(SELF_ID);
    expect(body.b.userId).toBe(OPP_ID);
    expect(body.totals).toEqual({
      played: 3,
      aWins: 1,
      bWins: 1,
      draws: 1,
    });
    // recent is most-recent-first and carries tenant_id per encounter.
    expect(body.recent.map((r) => r.matchId)).toEqual(['m3', 'm2', 'm1']);
    expect(body.recent.map((r) => r.winner)).toEqual(['draw', 'b', 'a']);
    const tenants = new Set(body.recent.map((r) => r.tenantId));
    expect(tenants).toEqual(new Set([TENANT_1, TENANT_2]));
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('ignores same-team matches and substitute participations', async () => {
    // m1: A and B on the SAME team → not a confrontation.
    part(TENANT_1, 'm1', 'T1a', SELF_ID);
    part(TENANT_1, 'm1', 'T1a', OPP_ID);
    match(TENANT_1, 'm1', 'T1a', '2026-01-01T00:00:00Z');

    // m2: opposing sides but B is a SUBSTITUTE → not counted.
    part(TENANT_1, 'm2', 'T2a', SELF_ID);
    part(TENANT_1, 'm2', 'T2b', OPP_ID, /* isSub */ true);
    match(TENANT_1, 'm2', 'T2a', '2026-02-01T00:00:00Z');

    // m3: a genuine opposing-sides confrontation → the only counted match.
    part(TENANT_2, 'm3', 'X', SELF_ID);
    part(TENANT_2, 'm3', 'Y', OPP_ID);
    match(TENANT_2, 'm3', 'X', '2026-03-01T00:00:00Z');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as H2HBody;
    expect(body.totals).toEqual({ played: 1, aWins: 1, bWins: 0, draws: 0 });
    expect(body.recent.map((r) => r.matchId)).toEqual(['m3']);
  });

  it('returns an empty tally when the two never faced each other', async () => {
    // A plays m1, B plays a disjoint m2 → no shared match.
    part(TENANT_1, 'm1', 'T1a', SELF_ID);
    match(TENANT_1, 'm1', 'T1a', '2026-01-01T00:00:00Z');
    part(TENANT_1, 'm2', 'T2b', OPP_ID);
    match(TENANT_1, 'm2', 'T2b', '2026-02-01T00:00:00Z');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as H2HBody;
    expect(body.totals).toEqual({ played: 0, aWins: 0, bWins: 0, draws: 0 });
    expect(body.recent).toEqual([]);
  });

  it('self need NOT be discoverable to view own H2H against a discoverable opponent', async () => {
    // Only the opponent is discoverable (seeded in beforeEach); self has no row.
    part(TENANT_1, 'm1', 'T1a', SELF_ID);
    part(TENANT_1, 'm1', 'T1b', OPP_ID);
    match(TENANT_1, 'm1', 'T1a', '2026-01-01T00:00:00Z');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as H2HBody).totals.played).toBe(1);
  });
});

describe('GET /api/player/discovery/head-to-head — privacy gate', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: SELF_ID });
  });

  it('404 NOT_DISCOVERABLE when the opponent has no discovery profile row', async () => {
    // No player_discovery_profiles seeded at all.
    part(TENANT_1, 'm1', 'T1a', SELF_ID);
    part(TENANT_1, 'm1', 'T1b', OPP_ID);
    match(TENANT_1, 'm1', 'T1a', '2026-01-01T00:00:00Z');

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe('NOT_DISCOVERABLE');
  });

  it('404 NOT_DISCOVERABLE when the opponent row is discoverable=false', async () => {
    store.player_discovery_profiles = [
      { auth_user_id: OPP_ID, discoverable: false },
    ];

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe('NOT_DISCOVERABLE');
  });
});

describe('GET /api/player/discovery/head-to-head — validation & method', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: SELF_ID });
    store.player_discovery_profiles = [
      { auth_user_id: OPP_ID, discoverable: true },
    ];
  });

  it('400 INVALID_QUERY when opponentId is not a uuid', async () => {
    const req = makeReq({ query: { opponentId: 'not-a-uuid' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_QUERY');
  });

  it('400 SELF_OPPONENT when opponentId equals the caller', async () => {
    const req = makeReq({ query: { opponentId: SELF_ID } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('SELF_OPPONENT');
  });

  it('405 + Allow: GET on a non-GET method', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

describe('GET /api/player/discovery/head-to-head — auth', () => {
  beforeEach(() => resetSupabaseMock());

  it('401 when unauthenticated (no Bearer token)', async () => {
    const req = makeReq({ headers: { host: 'h' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('401 when the Bearer token resolves to no user', async () => {
    setAuthUser(null);
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });
});
