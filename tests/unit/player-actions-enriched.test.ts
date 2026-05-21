// tests/unit/player-actions-enriched.test.ts
// GET /api/bot/v1/players/by-discord/[discordUserId]/actions-todo

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/actions-todo';

const PLAYER_AUTH = 'auth-player-1';
const PLAYER_DISCORD = '900000000000000001';
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440b01';
const OTHER_TEAM = '550e8400-e29b-41d4-a716-446655440b02';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts. The
// fallback resolveTenantId() injects this value into req.botContext.tenantId
// when the bot doesn't send x-tenant-id, so fixtures must carry it too for
// the S3 sweep tenant_id filters to match.
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': CONFERENCE_TENANT_ID },
    query: { discordUserId: PLAYER_DISCORD },
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
  process.env.BOT_API_KEY = 'test-key';
  // V2 strict tenant header — withBotRoute checks existence in `tenants`.
  store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;

  const now = Date.now();
  const inOneHour = new Date(now + 60 * 60_000).toISOString();

  store.user_discord_links = [
    { discord_user_id: PLAYER_DISCORD, auth_user_id: PLAYER_AUTH },
  ] as any;
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Captained Team',
      captain_id: PLAYER_AUTH,
    },
  ] as any;
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      scheduled_at: inOneHour,
      status: 'pending',
      is_bye: false,
      team1_id: TEAM_ID,
      team2_id: OTHER_TEAM,
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      veto_locked_at: null,
      team1: { id: TEAM_ID, name: 'Captained Team' },
      team2: { id: OTHER_TEAM, name: 'Other Team' },
    },
  ] as any;
  store.match_score_reports = [] as any;
  store.demandes = [] as any;
  store.player_action_snoozes = [] as any;
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
});

describe('GET /api/bot/v1/players/by-discord/[id]/actions-todo', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('404 when discordUserId not linked', async () => {
    store.user_discord_links = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('happy path: actions have actionKey, snoozedUntil, group', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.actions.length).toBeGreaterThan(0);
    for (const a of body.actions) {
      // Shape contract
      expect(typeof a.actionKey).toBe('string');
      expect(a.actionKey.length).toBeGreaterThan(0);
      expect('snoozedUntil' in a).toBe(true);
      expect(['urgent', 'today', 'later']).toContain(a.group);
    }
    // checkin key derived from match id (deterministic, not array index)
    const checkin = body.actions.find((a: any) => a.type === 'checkin');
    expect(checkin?.actionKey).toBe(`checkin:match:${MATCH_ID}`);
  });

  it('actionKey is deterministic across calls (same IDs -> same key)', async () => {
    const r1 = makeRes();
    await handler(makeReq(), r1);
    const r2 = makeRes();
    await handler(makeReq(), r2);
    const k1 = (r1.body as any).actions.map((a: any) => a.actionKey).sort();
    const k2 = (r2.body as any).actions.map((a: any) => a.actionKey).sort();
    expect(k1).toEqual(k2);
  });

  it('filters out snoozed actions (snoozed_until > now)', async () => {
    const key = `checkin:match:${MATCH_ID}`;
    store.player_action_snoozes = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: PLAYER_DISCORD,
        action_key: key,
        snoozed_until: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const keys = (res.body as any).actions.map((a: any) => a.actionKey);
    expect(keys).not.toContain(key);
  });

  it('does NOT filter expired snoozes (still visible, snoozedUntil null)', async () => {
    const key = `checkin:match:${MATCH_ID}`;
    store.player_action_snoozes = [
      {
        tenant_id: CONFERENCE_TENANT_ID,
        discord_user_id: PLAYER_DISCORD,
        action_key: key,
        snoozed_until: new Date(Date.now() - 60_000).toISOString(),
      },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const checkin = (res.body as any).actions.find(
      (a: any) => a.actionKey === key
    );
    expect(checkin).toBeTruthy();
    // expired snoozes are not loaded into snoozedUntilByKey, so the field
    // reads as null on the returned action
    expect(checkin.snoozedUntil).toBeNull();
  });
});
