// Unit tests for the player follow API (cross-tenant, opt-in, behind login).
//
//   pages/api/player/follows/index.ts — POST follow / DELETE unfollow / GET list
//
// Product invariant (strong kill-switch): you can only follow a DISCOVERABLE
// player, and lists surface only players who are CURRENTLY discoverable. An
// opt-out (discoverable=false) makes the player disappear from everyone's lists
// without deleting the underlying player_follows edge.
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

import followsHandler from '@/pages/api/player/follows';

// RFC 9562-valid UUIDs (version 4, correct variant bits): zod v4's .uuid()
// rejects the all-same-digit style used elsewhere because their variant nibble
// is invalid, and the follow body validates followeeId as a strict uuid.
const ME = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';

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

function discoverable(authUserId: string, over: Record<string, unknown> = {}) {
  return {
    auth_user_id: authUserId,
    discoverable: true,
    display_name: null,
    show_ratings: true,
    show_teams: true,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...over,
  };
}

type ListBody = {
  players: Array<{
    authUserId: string;
    displayName: string;
    isFollowing: boolean;
    followerCount: number;
    teams?: Array<{ name: string; slug: string | null }>;
    stats?: { games: number; peakRating: number; tenants: number };
  }>;
  total: number;
  limit: number;
  offset: number;
  type: 'following' | 'followers';
};

describe('POST /api/player/follows (follow)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: ME });
  });

  it('follows a discoverable player and persists exactly one edge', async () => {
    store.player_discovery_profiles = [discoverable(A)];

    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: A } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ following: true });

    const edges = (store.player_follows ?? []).filter(
      (r) => r.follower_id === ME && r.followee_id === A
    );
    expect(edges).toHaveLength(1);
  });

  it('is idempotent: following twice keeps a single edge', async () => {
    store.player_discovery_profiles = [discoverable(A)];

    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: A } }),
      makeRes()
    );
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: A } }),
      makeRes()
    );

    const edges = (store.player_follows ?? []).filter(
      (r) => r.follower_id === ME && r.followee_id === A
    );
    expect(edges).toHaveLength(1);
  });

  it('rejects self-follow with 400 CANNOT_FOLLOW_SELF', async () => {
    store.player_discovery_profiles = [discoverable(ME)];

    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: ME } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('CANNOT_FOLLOW_SELF');
    expect(store.player_follows ?? []).toHaveLength(0);
  });

  it('404s NOT_DISCOVERABLE when the target has no discovery row', async () => {
    store.player_discovery_profiles = [];

    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: A } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe('NOT_DISCOVERABLE');
    expect(store.player_follows ?? []).toHaveLength(0);
  });

  it('404s NOT_DISCOVERABLE when the target opted out (discoverable=false)', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { discoverable: false }),
    ];

    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: A } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as { code?: string }).code).toBe('NOT_DISCOVERABLE');
  });

  it('400s on a non-uuid followeeId', async () => {
    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'POST', body: { followeeId: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });
});

describe('DELETE /api/player/follows (unfollow)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: ME });
  });

  it('removes the edge and is idempotent', async () => {
    store.player_discovery_profiles = [discoverable(A)];
    store.player_follows = [
      { follower_id: ME, followee_id: A, created_at: '2026-07-13T00:00:00Z' },
    ];

    const res1 = makeRes();
    await followsHandler(
      makeReq({ method: 'DELETE', body: { followeeId: A } }),
      res1
    );
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toEqual({ following: false });
    expect(
      (store.player_follows ?? []).some(
        (r) => r.follower_id === ME && r.followee_id === A
      )
    ).toBe(false);

    // Second delete: still 200, still no edge (idempotent).
    const res2 = makeRes();
    await followsHandler(
      makeReq({ method: 'DELETE', body: { followeeId: A } }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ following: false });
  });

  it('only removes the caller-scoped edge, not another follower', async () => {
    store.player_discovery_profiles = [discoverable(A)];
    store.player_follows = [
      { follower_id: ME, followee_id: A },
      { follower_id: B, followee_id: A },
    ];

    await followsHandler(
      makeReq({ method: 'DELETE', body: { followeeId: A } }),
      makeRes()
    );

    expect(
      (store.player_follows ?? []).some(
        (r) => r.follower_id === B && r.followee_id === A
      )
    ).toBe(true);
    expect((store.player_follows ?? []).some((r) => r.follower_id === ME)).toBe(
      false
    );
  });
});

describe('GET /api/player/follows (lists)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: ME });
  });

  it('following lists only discoverable followees', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { display_name: 'Alpha' }),
      discoverable(B, { display_name: 'Bravo' }),
    ];
    store.player_follows = [
      { follower_id: ME, followee_id: A },
      { follower_id: ME, followee_id: B },
      { follower_id: B, followee_id: A }, // unrelated edge (B follows A)
    ];

    const res = makeRes();
    await followsHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as ListBody;
    expect(body.type).toBe('following');
    expect(body.total).toBe(2);
    const ids = body.players.map((p) => p.authUserId).sort();
    expect(ids).toEqual([A, B].sort());
  });

  it('drops a followee who flips discoverable=false', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { display_name: 'Alpha' }),
      discoverable(B, { display_name: 'Bravo', discoverable: false }),
    ];
    store.player_follows = [
      { follower_id: ME, followee_id: A },
      { follower_id: ME, followee_id: B },
    ];

    const res = makeRes();
    await followsHandler(makeReq({ method: 'GET' }), res);

    const body = res.body as ListBody;
    expect(body.total).toBe(1);
    expect(body.players.map((p) => p.authUserId)).toEqual([A]);
    // The edge to B still exists in the DB (kill-switch, not delete).
    expect((store.player_follows ?? []).some((r) => r.followee_id === B)).toBe(
      true
    );
  });

  it('followers direction lists discoverable players who follow me', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { display_name: 'Alpha' }),
      discoverable(C, { display_name: 'Charlie', discoverable: false }),
    ];
    store.player_follows = [
      { follower_id: A, followee_id: ME },
      { follower_id: C, followee_id: ME }, // C follows me but is not discoverable
    ];

    const res = makeRes();
    await followsHandler(
      makeReq({ method: 'GET', query: { type: 'followers' } }),
      res
    );

    const body = res.body as ListBody;
    expect(body.type).toBe('followers');
    expect(body.total).toBe(1);
    expect(body.players.map((p) => p.authUserId)).toEqual([A]);
  });

  it('enriches each listed player with isFollowing and followerCount', async () => {
    store.player_discovery_profiles = [
      discoverable(A, { display_name: 'Alpha' }),
    ];
    store.player_follows = [
      { follower_id: ME, followee_id: A }, // I follow A
      { follower_id: B, followee_id: A }, // and so does B → count 2
    ];

    const res = makeRes();
    await followsHandler(makeReq({ method: 'GET' }), res);

    const body = res.body as ListBody;
    const p = body.players.find((x) => x.authUserId === A)!;
    expect(p.isFollowing).toBe(true);
    expect(p.followerCount).toBe(2);
  });

  it('returns an empty list when the caller follows nobody', async () => {
    store.player_discovery_profiles = [discoverable(A)];

    const res = makeRes();
    await followsHandler(makeReq({ method: 'GET' }), res);

    const body = res.body as ListBody;
    expect(body.total).toBe(0);
    expect(body.players).toEqual([]);
  });
});

describe('/api/player/follows method + auth', () => {
  beforeEach(() => resetSupabaseMock());

  it('401s when unauthenticated', async () => {
    const req = makeReq({ method: 'GET', headers: { host: 'h' } });
    const res = makeRes();
    await followsHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('405s on an unsupported method with an Allow header', async () => {
    setAuthUser({ id: ME });
    const req = makeReq({ method: 'PUT' });
    const res = makeRes();
    await followsHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET,POST,DELETE');
  });
});
