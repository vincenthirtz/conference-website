// Unit tests for the player discovery API (cross-tenant, opt-in, behind login).
//
//   pages/api/player/discovery/index.ts   — GET/PUT own discovery card
//   pages/api/player/discovery/search.ts  — GET the directory (withAuthRoute)
//
// Invariants under test:
//   - invisible by default (no row → discoverable:false),
//   - opt-in stamps opted_in_at once and never clears it (kill-switch keeps it),
//   - the directory only lists discoverable players,
//   - the directory is BEHIND LOGIN (401 without a Bearer token),
//   - show_ratings=false hides a player's stats.
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

import ownHandler from '@/pages/api/player/discovery';
import searchHandler from '@/pages/api/player/discovery/search';

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

type Card = {
  discoverable: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  showRatings: boolean;
  showTeams: boolean;
  optedInAt: string | null;
};

type SearchBody = {
  players: Array<{
    authUserId: string;
    displayName: string;
    avatarUrl: string | null;
    tagline: string | null;
    discordUsername: string | null;
    stats?: { games: number; peakRating: number; tenants: number };
  }>;
  total: number;
  limit: number;
  offset: number;
};

describe('GET /api/player/discovery (own card)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('is invisible by default when no row exists', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await ownHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Card;
    expect(body.discoverable).toBe(false);
    expect(body.showRatings).toBe(true);
    expect(body.showTeams).toBe(true);
    expect(body.displayName).toBeNull();
    expect(body.avatarUrl).toBeNull();
    expect(body.tagline).toBeNull();
    expect(body.optedInAt).toBeNull();
  });

  it('reflects an existing row', async () => {
    store.player_discovery_profiles = [
      {
        auth_user_id: USER_ID,
        discoverable: true,
        display_name: 'Nova',
        avatar_url: 'https://cdn.example/a.png',
        tagline: 'Support main',
        show_ratings: false,
        show_teams: true,
        opted_in_at: '2026-07-13T10:00:00.000Z',
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await ownHandler(req, res);

    const body = res.body as Card;
    expect(body.discoverable).toBe(true);
    expect(body.displayName).toBe('Nova');
    expect(body.avatarUrl).toBe('https://cdn.example/a.png');
    expect(body.tagline).toBe('Support main');
    expect(body.showRatings).toBe(false);
    expect(body.showTeams).toBe(true);
    expect(body.optedInAt).toBe('2026-07-13T10:00:00.000Z');
  });
});

describe('PUT /api/player/discovery (opt-in lifecycle)', () => {
  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('opting in persists discoverable:true and stamps opted_in_at', async () => {
    const req = makeReq({
      method: 'PUT',
      body: { discoverable: true, displayName: 'Nova' },
    });
    const res = makeRes();
    await ownHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Card;
    expect(body.discoverable).toBe(true);
    expect(body.displayName).toBe('Nova');
    expect(body.optedInAt).not.toBeNull();

    const row = (store.player_discovery_profiles ?? []).find(
      (r) => r.auth_user_id === USER_ID
    );
    expect(row).toBeTruthy();
    expect(row?.discoverable).toBe(true);
    expect(row?.opted_in_at).toBeTruthy();
  });

  it('a later PUT touching other fields does NOT change opted_in_at', async () => {
    // First opt-in.
    const put1 = makeReq({ method: 'PUT', body: { discoverable: true } });
    await ownHandler(put1, makeRes());

    const firstOptedInAt = (store.player_discovery_profiles ?? []).find(
      (r) => r.auth_user_id === USER_ID
    )?.opted_in_at;
    expect(firstOptedInAt).toBeTruthy();

    // Second PUT: toggle other fields, still discoverable.
    const put2 = makeReq({
      method: 'PUT',
      body: { tagline: 'Flex', showRatings: false },
    });
    const res2 = makeRes();
    await ownHandler(put2, res2);

    const body = res2.body as Card;
    expect(body.discoverable).toBe(true);
    expect(body.tagline).toBe('Flex');
    expect(body.showRatings).toBe(false);
    expect(body.optedInAt).toBe(firstOptedInAt);
  });

  it('kill-switch (discoverable:false) keeps the row and preserves opted_in_at', async () => {
    // Opt in first.
    await ownHandler(
      makeReq({ method: 'PUT', body: { discoverable: true } }),
      makeRes()
    );
    const optedInAt = (store.player_discovery_profiles ?? []).find(
      (r) => r.auth_user_id === USER_ID
    )?.opted_in_at;
    expect(optedInAt).toBeTruthy();

    // Kill-switch.
    const res = makeRes();
    await ownHandler(
      makeReq({ method: 'PUT', body: { discoverable: false } }),
      res
    );

    const body = res.body as Card;
    expect(body.discoverable).toBe(false);
    expect(body.optedInAt).toBe(optedInAt);

    const row = (store.player_discovery_profiles ?? []).find(
      (r) => r.auth_user_id === USER_ID
    );
    // Row still exists (audit), just not discoverable.
    expect(row).toBeTruthy();
    expect(row?.discoverable).toBe(false);
    expect(row?.opted_in_at).toBe(optedInAt);
  });

  it('400s when tagline exceeds 160 chars', async () => {
    const req = makeReq({
      method: 'PUT',
      body: { tagline: 'x'.repeat(161) },
    });
    const res = makeRes();
    await ownHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_BODY');
  });
});

describe('/api/player/discovery method + auth', () => {
  beforeEach(() => resetSupabaseMock());

  it('401s when unauthenticated', async () => {
    const req = makeReq({ method: 'GET', headers: { host: 'h' } });
    const res = makeRes();
    await ownHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('405s on an unsupported method', async () => {
    setAuthUser({ id: USER_ID });
    const req = makeReq({ method: 'DELETE' });
    const res = makeRes();
    await ownHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET,PUT');
  });
});

describe('GET /api/player/discovery/search (directory)', () => {
  const A = '22222222-2222-2222-2222-222222222222';
  const B = '33333333-3333-3333-3333-333333333333';
  const C = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    resetSupabaseMock();
    setAuthUser({ id: USER_ID });
  });

  it('lists only discoverable players; total reflects only discoverable', async () => {
    store.player_discovery_profiles = [
      {
        auth_user_id: A,
        discoverable: true,
        display_name: 'Alpha',
        show_ratings: true,
        updated_at: '2026-07-13T10:00:00.000Z',
      },
      {
        auth_user_id: B,
        discoverable: true,
        display_name: 'Bravo',
        show_ratings: true,
        updated_at: '2026-07-13T09:00:00.000Z',
      },
      {
        auth_user_id: C,
        discoverable: false,
        display_name: 'Charlie',
        show_ratings: true,
        updated_at: '2026-07-13T08:00:00.000Z',
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await searchHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as SearchBody;
    expect(body.total).toBe(2);
    const ids = body.players.map((p) => p.authUserId).sort();
    expect(ids).toEqual([A, B].sort());
    // The non-discoverable player is absent.
    expect(body.players.some((p) => p.authUserId === C)).toBe(false);
  });

  it('enriches with aggregated cross-tenant stats and discord username', async () => {
    store.player_discovery_profiles = [
      {
        auth_user_id: A,
        discoverable: true,
        display_name: 'Alpha',
        show_ratings: true,
        updated_at: '2026-07-13T10:00:00.000Z',
      },
    ];
    store.player_ratings = [
      {
        user_id: A,
        tenant_id: 'tenant-1',
        games_played: 10,
        peak_rating: 1400,
      },
      {
        user_id: A,
        tenant_id: 'tenant-2',
        games_played: 5,
        peak_rating: 1600,
      },
    ];
    store.user_discord_links = [
      {
        auth_user_id: A,
        discord_user_id: 'd-1',
        discord_username: 'alpha#0001',
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await searchHandler(req, res);

    const body = res.body as SearchBody;
    const p = body.players.find((x) => x.authUserId === A)!;
    expect(p.discordUsername).toBe('alpha#0001');
    expect(p.stats).toEqual({ games: 15, peakRating: 1600, tenants: 2 });
  });

  it('omits stats for a discoverable player with show_ratings:false', async () => {
    store.player_discovery_profiles = [
      {
        auth_user_id: A,
        discoverable: true,
        display_name: 'Alpha',
        show_ratings: false,
        updated_at: '2026-07-13T10:00:00.000Z',
      },
    ];
    store.player_ratings = [
      {
        user_id: A,
        tenant_id: 'tenant-1',
        games_played: 10,
        peak_rating: 1400,
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await searchHandler(req, res);

    const body = res.body as SearchBody;
    const p = body.players.find((x) => x.authUserId === A)!;
    expect(p.stats).toBeUndefined();
  });

  it('displayName falls back to discord username then "Joueur"', async () => {
    store.player_discovery_profiles = [
      {
        auth_user_id: A,
        discoverable: true,
        display_name: null,
        show_ratings: true,
        updated_at: '2026-07-13T10:00:00.000Z',
      },
      {
        auth_user_id: B,
        discoverable: true,
        display_name: null,
        show_ratings: true,
        updated_at: '2026-07-13T09:00:00.000Z',
      },
    ];
    store.user_discord_links = [
      {
        auth_user_id: A,
        discord_user_id: 'd-a',
        discord_username: 'alphaTag',
      },
    ];

    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await searchHandler(req, res);

    const body = res.body as SearchBody;
    expect(body.players.find((x) => x.authUserId === A)?.displayName).toBe(
      'alphaTag'
    );
    expect(body.players.find((x) => x.authUserId === B)?.displayName).toBe(
      'Joueur'
    );
  });

  it('is BEHIND LOGIN: 401 without a Bearer token', async () => {
    const req = makeReq({ method: 'GET', headers: { host: 'h' } });
    const res = makeRes();
    await searchHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('405s on an unsupported method', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await searchHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});
