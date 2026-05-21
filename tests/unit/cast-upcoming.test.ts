// tests/unit/cast-upcoming.test.ts
// GET /api/bot/v1/cast/upcoming — fenetre 5..120 min, exclut acked, exclut
// matchs annules / finished / is_bye.
//
// S6 (multi-tenant) : la route est `crossTenant: true`. Pas de header
// `x-tenant-id` requis ; chaque row expose son propre `tenantId` pour que
// le bot route vers le bon guild en un seul poll.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/cast/upcoming';

const MATCH_A = '550e8400-e29b-41d4-a716-446655440a01';
const MATCH_B = '550e8400-e29b-41d4-a716-446655440a02';
const MATCH_FINISHED = '550e8400-e29b-41d4-a716-446655440a03';
const MATCH_TENANT_X = '550e8400-e29b-41d4-a716-446655440a04';
const MATCH_TENANT_Y = '550e8400-e29b-41d4-a716-446655440a05';
const ASSIGN_A = '550e8400-e29b-41d4-a716-446655440b01';
const ASSIGN_B = '550e8400-e29b-41d4-a716-446655440b02';
const ASSIGN_FINISHED = '550e8400-e29b-41d4-a716-446655440b03';
const ASSIGN_ACKED = '550e8400-e29b-41d4-a716-446655440b04';
const ASSIGN_TENANT_X = '550e8400-e29b-41d4-a716-446655440b05';
const ASSIGN_TENANT_Y = '550e8400-e29b-41d4-a716-446655440b06';
const CAST_MEMBER_A = '550e8400-e29b-41d4-a716-446655440c01';
const CAST_MEMBER_B = '550e8400-e29b-41d4-a716-446655440c02';
const CASTER_AUTH_A = 'auth-caster-a';
const CASTER_AUTH_B = 'auth-caster-b';
const CASTER_DISCORD_A = '900000000000000001';
const CASTER_DISCORD_B = '900000000000000002';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440d01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440d02';
const TOURNAMENT = '550e8400-e29b-41d4-a716-446655440e01';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts.
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
// Tenants additionnels pour le test cross-tenant.
const TENANT_X_ID = '11111111-2222-4333-8444-555555555555';
const TENANT_Y_ID = '99999999-aaaa-4bbb-8ccc-dddddddddddd';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    // crossTenant: true → pas besoin de header `x-tenant-id`. On le retire
    // volontairement des defaults pour exercer le bypass du middleware.
    headers: { host: 'h', 'x-api-key': 'test-key' },
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
  process.env.BOT_API_KEY = 'test-key';
  // V2 strict tenant header — withBotRoute checks existence in `tenants`.
  store.tenants = [{ id: CONFERENCE_TENANT_ID }] as any;

  const now = Date.now();
  const inTenMin = new Date(now + 10 * 60_000).toISOString();
  const inTwentyMin = new Date(now + 20 * 60_000).toISOString();
  const inPast = new Date(now - 60 * 60_000).toISOString();

  // 4 assignments seeded:
  //   ASSIGN_A : unacked, match in 10min, status pending          -> IN
  //   ASSIGN_B : unacked, match in 20min, status pending          -> IN
  //   ASSIGN_FINISHED : unacked, match finished                   -> OUT
  //   ASSIGN_ACKED : already acked_at set                         -> OUT
  store.cast_assignments = [
    {
      id: ASSIGN_A,
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_A,
      cast_member_id: CAST_MEMBER_A,
      briefing_at: inTenMin,
      acked_at: null,
      // joined columns
      cast_member: { id: CAST_MEMBER_A, name: 'Alice', title: 'Caster', auth_user_id: CASTER_AUTH_A },
      match: {
        id: MATCH_A,
        status: 'pending',
        scheduled_at: inTenMin,
        is_bye: false,
        team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
        team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
        tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
      },
    },
    {
      id: ASSIGN_B,
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_B,
      cast_member_id: CAST_MEMBER_B,
      briefing_at: inTwentyMin,
      acked_at: null,
      cast_member: { id: CAST_MEMBER_B, name: 'Bob', title: 'Caster', auth_user_id: CASTER_AUTH_B },
      match: {
        id: MATCH_B,
        status: 'pending',
        scheduled_at: inTwentyMin,
        is_bye: false,
        team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
        team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
        tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
      },
    },
    {
      id: ASSIGN_FINISHED,
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_FINISHED,
      cast_member_id: CAST_MEMBER_A,
      briefing_at: inPast,
      acked_at: null,
      cast_member: { id: CAST_MEMBER_A, name: 'Alice', title: 'Caster', auth_user_id: CASTER_AUTH_A },
      match: {
        id: MATCH_FINISHED,
        status: 'finished',
        scheduled_at: inPast,
        is_bye: false,
        team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
        team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
        tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
      },
    },
    {
      id: ASSIGN_ACKED,
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_A,
      cast_member_id: CAST_MEMBER_B,
      briefing_at: inTenMin,
      acked_at: new Date(now - 30 * 60_000).toISOString(),
      cast_member: { id: CAST_MEMBER_B, name: 'Bob', title: 'Caster', auth_user_id: CASTER_AUTH_B },
      match: {
        id: MATCH_A,
        status: 'pending',
        scheduled_at: inTenMin,
        is_bye: false,
        team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
        team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
        tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
      },
    },
  ] as any;

  store.user_discord_links = [
    { auth_user_id: CASTER_AUTH_A, discord_user_id: CASTER_DISCORD_A },
    { auth_user_id: CASTER_AUTH_B, discord_user_id: CASTER_DISCORD_B },
  ] as any;
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
});

describe('GET /api/bot/v1/cast/upcoming', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('happy path: returns unacked assignments within default 30min window', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.withinMinutes).toBe(30);
    const ids = body.assignments.map((a: any) => a.assignmentId).sort();
    expect(ids).toEqual([ASSIGN_A, ASSIGN_B].sort());
    // acked_at is null in the returned shape
    expect(body.assignments[0].ackedAt).toBeNull();
    // caster discord id resolved
    const a = body.assignments.find((x: any) => x.assignmentId === ASSIGN_A);
    expect(a.casterDiscordUserId).toBe(CASTER_DISCORD_A);
    expect(a.tournamentName).toBe('Spring Cup');
    expect(a.teamA.name).toBe('Team Alpha');
    expect(a.teamB.name).toBe('Team Beta');
    expect(a.role).toBe('Caster');
    // S6 multi-tenant : chaque row expose son tenantId pour le routage bot.
    expect(a.tenantId).toBe(CONFERENCE_TENANT_ID);
  });

  it('crossTenant: no x-tenant-id header required (route is global)', async () => {
    const res = makeRes();
    // makeReq() default headers volontairement sans x-tenant-id.
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    // Aucune erreur MISSING_TENANT_ID / INVALID_TENANT_ID emise.
    expect((res.body as any).error).toBeUndefined();
  });

  it('returns assignments from multiple tenants in a single response', async () => {
    // Seed 2 assignments supplementaires sur 2 autres tenants — le poll
    // unique du bot doit recuperer les 3 (conference + X + Y) dans la
    // meme reponse, chacun avec son `tenantId`.
    const now = Date.now();
    const inFifteenMin = new Date(now + 15 * 60_000).toISOString();
    (store.cast_assignments as any[]).push(
      {
        id: ASSIGN_TENANT_X,
        tenant_id: TENANT_X_ID,
        match_id: MATCH_TENANT_X,
        cast_member_id: CAST_MEMBER_A,
        briefing_at: inFifteenMin,
        acked_at: null,
        cast_member: {
          id: CAST_MEMBER_A,
          name: 'Alice',
          title: 'Caster',
          auth_user_id: CASTER_AUTH_A,
        },
        match: {
          id: MATCH_TENANT_X,
          status: 'pending',
          scheduled_at: inFifteenMin,
          is_bye: false,
          team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
          team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
          tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
        },
      },
      {
        id: ASSIGN_TENANT_Y,
        tenant_id: TENANT_Y_ID,
        match_id: MATCH_TENANT_Y,
        cast_member_id: CAST_MEMBER_B,
        briefing_at: inFifteenMin,
        acked_at: null,
        cast_member: {
          id: CAST_MEMBER_B,
          name: 'Bob',
          title: 'Caster',
          auth_user_id: CASTER_AUTH_B,
        },
        match: {
          id: MATCH_TENANT_Y,
          status: 'pending',
          scheduled_at: inFifteenMin,
          is_bye: false,
          team1: { id: TEAM_1, name: 'Team Alpha', short_name: 'TA' },
          team2: { id: TEAM_2, name: 'Team Beta', short_name: 'TB' },
          tournament: { id: TOURNAMENT, name: 'Spring Cup', slug: 'spring-cup' },
        },
      }
    );

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;

    // Les 2 assignments cross-tenant doivent etre presents, avec leur tenantId.
    const byId = new Map<string, any>(
      body.assignments.map((a: any) => [a.assignmentId as string, a])
    );
    expect(byId.get(ASSIGN_TENANT_X)?.tenantId).toBe(TENANT_X_ID);
    expect(byId.get(ASSIGN_TENANT_Y)?.tenantId).toBe(TENANT_Y_ID);
    // L'assignment original (conference) est toujours la avec son tenantId.
    expect(byId.get(ASSIGN_A)?.tenantId).toBe(CONFERENCE_TENANT_ID);
  });

  it('400 if withinMinutes < 5', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { withinMinutes: '3' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 if withinMinutes > 120', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { withinMinutes: '150' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('withinMinutes=5 narrows the window (excludes the 20min one)', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { withinMinutes: '5' } }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).assignments.map((a: any) => a.assignmentId);
    // only ASSIGN_A (10min) and ASSIGN_B (20min) are unacked & pending, but
    // with a 5min window even ASSIGN_A is out (it's at 10min).
    expect(ids).not.toContain(ASSIGN_A);
    expect(ids).not.toContain(ASSIGN_B);
  });

  it('excludes finished matches and already-acked assignments', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { withinMinutes: '120' } }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).assignments.map((a: any) => a.assignmentId);
    expect(ids).not.toContain(ASSIGN_FINISHED);
    expect(ids).not.toContain(ASSIGN_ACKED);
  });
});
