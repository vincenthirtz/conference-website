// tests/unit/player-actions-snooze.test.ts
// POST /api/bot/v1/players/by-discord/[discordUserId]/actions/snooze

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/actions/snooze';

const PLAYER_DISCORD = '900000000000000001';
const OTHER_DISCORD = '900000000000000002';
const VALID_ACTION_KEY = 'checkin:match:550e8400-e29b-41d4-a716-446655440a01';
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: { discordUserId: PLAYER_DISCORD },
    body: {
      actorDiscordUserId: PLAYER_DISCORD,
      actionKey: VALID_ACTION_KEY,
      minutes: 60,
    },
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
  // Per-tenant bot auth: x-api-key resolves to CONFERENCE_TENANT_ID.
  seedBotAuth();
  // V2 strict tenant header — withBotRoute checks existence in `tenants`.
  store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;
  store.player_action_snoozes = [] as any;
});

describe('POST /api/bot/v1/players/by-discord/[id]/actions/snooze', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400 when discordUserId invalid', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { discordUserId: 'abc' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when actorDiscordUserId missing', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: { actionKey: VALID_ACTION_KEY, minutes: 60 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('403 when actor != path', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: OTHER_DISCORD,
          actionKey: VALID_ACTION_KEY,
          minutes: 60,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('400 when actionKey missing/malformed', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: 'ab',
          minutes: 60,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when minutes < 15', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: VALID_ACTION_KEY,
          minutes: 5,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when minutes > 1440', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: VALID_ACTION_KEY,
          minutes: 2000,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('happy path: inserts a snooze row, returns snoozedUntil', async () => {
    const res = makeRes();
    const before = Date.now();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.actionKey).toBe(VALID_ACTION_KEY);
    expect(body.minutes).toBe(60);
    const until = Date.parse(body.snoozedUntil);
    expect(until).toBeGreaterThan(before);
    // store mutated
    expect(store.player_action_snoozes.length).toBe(1);
    expect((store.player_action_snoozes[0] as any).discord_user_id).toBe(
      PLAYER_DISCORD
    );
    expect((store.player_action_snoozes[0] as any).action_key).toBe(
      VALID_ACTION_KEY
    );
  });

  it('default minutes = 60 when omitted', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: VALID_ACTION_KEY,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).minutes).toBe(60);
  });

  it('idempotent upsert: 2nd call updates snoozed_until on the same row', async () => {
    const res1 = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: VALID_ACTION_KEY,
          minutes: 30,
        },
      }),
      res1
    );
    expect(res1.statusCode).toBe(200);
    const firstUntil = (res1.body as any).snoozedUntil;

    // small wait via setTimeout 1ms to avoid identical timestamps
    await new Promise((r) => setTimeout(r, 5));

    const res2 = makeRes();
    await handler(
      makeReq({
        body: {
          actorDiscordUserId: PLAYER_DISCORD,
          actionKey: VALID_ACTION_KEY,
          minutes: 120,
        },
      }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    const secondUntil = (res2.body as any).snoozedUntil;

    // Single row in store (upsert behavior on PK)
    expect(store.player_action_snoozes.length).toBe(1);
    // New snoozed_until > first
    expect(Date.parse(secondUntil)).toBeGreaterThan(Date.parse(firstUntil));
  });
});
