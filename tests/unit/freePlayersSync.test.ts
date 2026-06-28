// tests/unit/freePlayersSync.test.ts
//
// POST /api/bot/v1/free-players/sync — full-replace semantics, link resolution,
// tenant isolation.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
// Maintenance mode off (writes allowed).
vi.mock('@/utils/maintenance', () => ({
  isBotMaintenanceMode: vi.fn(async () => false),
}));

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import syncHandler from '../../pages/api/bot/v1/free-players/sync';

const OTHER_TENANT_ID = '11111111-2222-3333-4444-555555555555';

// Discord snowflakes (15-25 digits).
const D_ALICE = '100000000000000001';
const D_BOB = '100000000000000002';
const D_CAROL = '100000000000000003';

const U_ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const U_BOB = 'aaaaaaaa-0000-0000-0000-000000000002';

function makeBotReq(over: Partial<any> = {}, method = 'POST'): any {
  return {
    method,
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  store.user_discord_links = [
    {
      auth_user_id: U_ALICE,
      discord_user_id: D_ALICE,
      discord_username: 'alice',
    },
    { auth_user_id: U_BOB, discord_user_id: D_BOB, discord_username: 'bob' },
  ] as any;
  store.free_players = [] as any;
});

describe('POST /api/bot/v1/free-players/sync', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await syncHandler(
      { ...makeBotReq({ body: { players: [] } }), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 on bad body (missing players)', async () => {
    const res = makeRes();
    await syncHandler(makeBotReq({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('inserts new free players and resolves links (linked vs unlinked)', async () => {
    const res = makeRes();
    await syncHandler(
      makeBotReq({
        body: {
          players: [
            { discordUserId: D_ALICE, discordUsername: 'alice' },
            { discordUserId: D_BOB, discordUsername: 'bob' },
            { discordUserId: D_CAROL, discordUsername: 'carol' }, // unlinked
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      count: 3,
      linked: 2,
      unlinked: 1,
      unlinkedDiscordIds: [D_CAROL],
    });

    const rows = store.free_players as any[];
    expect(rows).toHaveLength(3);
    const alice = rows.find((r) => r.discord_user_id === D_ALICE);
    expect(alice.auth_user_id).toBe(U_ALICE);
    const carol = rows.find((r) => r.discord_user_id === D_CAROL);
    expect(carol.auth_user_id).toBeNull();
    expect(carol.tenant_id).toBe(CONFERENCE_TENANT_ID);
  });

  it('full-replace: removes rows absent from the new payload', async () => {
    store.free_players = [
      {
        id: 'fp-old-1',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: D_ALICE,
        discord_username: 'alice',
        auth_user_id: U_ALICE,
      },
      {
        id: 'fp-old-2',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: D_BOB,
        discord_username: 'bob',
        auth_user_id: U_BOB,
      },
    ] as any;

    const res = makeRes();
    // New payload keeps only Carol — Alice & Bob must be deleted.
    await syncHandler(
      makeBotReq({
        body: {
          players: [{ discordUserId: D_CAROL, discordUsername: 'carol' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      count: 1,
      linked: 0,
      unlinked: 1,
      unlinkedDiscordIds: [D_CAROL],
    });

    const ids = (store.free_players as any[]).map((r) => r.discord_user_id);
    expect(ids).toEqual([D_CAROL]);
  });

  it('empty payload wipes the tenant free players', async () => {
    store.free_players = [
      {
        id: 'fp-old-1',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: D_ALICE,
        auth_user_id: U_ALICE,
      },
    ] as any;
    const res = makeRes();
    await syncHandler(makeBotReq({ body: { players: [] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      count: 0,
      linked: 0,
      unlinked: 0,
      unlinkedDiscordIds: [],
    });
    expect(store.free_players).toHaveLength(0);
  });

  it('updates username + auth_user_id on conflict (upsert)', async () => {
    store.free_players = [
      {
        id: 'fp-1',
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: D_ALICE,
        discord_username: 'old-name',
        auth_user_id: null,
      },
    ] as any;
    const res = makeRes();
    await syncHandler(
      makeBotReq({
        body: {
          players: [{ discordUserId: D_ALICE, discordUsername: 'new-name' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.free_players as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].discord_username).toBe('new-name');
    expect(rows[0].auth_user_id).toBe(U_ALICE);
  });

  it('unlinkedDiscordIds lists only the unlinked discord ids of the set', async () => {
    const res = makeRes();
    await syncHandler(
      makeBotReq({
        body: {
          players: [
            { discordUserId: D_ALICE, discordUsername: 'alice' }, // linked
            { discordUserId: D_CAROL, discordUsername: 'carol' }, // unlinked
            { discordUserId: D_BOB, discordUsername: 'bob' }, // linked
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.linked).toBe(2);
    expect(body.unlinked).toBe(1);
    // Only the unlinked id, and never a linked one.
    expect(body.unlinkedDiscordIds).toEqual([D_CAROL]);
    expect(body.unlinkedDiscordIds).not.toContain(D_ALICE);
    expect(body.unlinkedDiscordIds).not.toContain(D_BOB);
  });

  it('tenant isolation: does not touch another tenant rows', async () => {
    store.free_players = [
      {
        id: 'fp-other',
        tenant_id: OTHER_TENANT_ID,
        discord_user_id: D_ALICE,
        discord_username: 'alice-other',
        auth_user_id: U_ALICE,
      },
    ] as any;
    const res = makeRes();
    // Sync for CONFERENCE tenant with an EMPTY payload — must not delete the
    // other tenant's row.
    await syncHandler(makeBotReq({ body: { players: [] } }), res);
    expect(res.statusCode).toBe(200);
    const other = (store.free_players as any[]).find(
      (r) => r.tenant_id === OTHER_TENANT_ID
    );
    expect(other).toBeTruthy();
    expect(other.discord_user_id).toBe(D_ALICE);
  });
});
