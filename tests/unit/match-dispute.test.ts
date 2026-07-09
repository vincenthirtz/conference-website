// tests/unit/match-dispute.test.ts
// GET /api/bot/v1/matches/[matchId]/dispute (capitaine)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/matches/[matchId]/dispute';

const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const MATCH_NO_DISPUTE = '550e8400-e29b-41d4-a716-446655440a02';
const UNKNOWN_MATCH = '550e8400-e29b-41d4-a716-44665544ffff';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAPTAIN_AUTH = 'auth-captain-1';
const OTHER_AUTH = 'auth-other';
const STAFF_INTERNAL_ID = 'staff-internal-uuid'; // should NOT leak
const CAPTAIN_DISCORD = '900000000000000001';
const NON_CAPTAIN_DISCORD = '900000000000000002';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts. The
// fallback resolveTenantId() injects this value into req.botContext.tenantId
// when the bot doesn't send x-tenant-id, so fixtures must carry it too for
// the S3 sweep tenant_id filters to match.
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: { matchId: MATCH_ID, actorDiscordUserId: CAPTAIN_DISCORD },
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
  // Per-tenant bot auth: x-api-key resolves to CONFERENCE_TENANT_ID.
  seedBotAuth();
  // V2 strict tenant header — withBotRoute checks existence in `tenants`.
  store.tenants = [{ id: CONFERENCE_TENANT_ID, plan: 'foundation', plan_status: 'active', plan_expires_at: null }] as any;

  store.user_discord_links = [
    { discord_user_id: CAPTAIN_DISCORD, auth_user_id: CAPTAIN_AUTH },
    { discord_user_id: NON_CAPTAIN_DISCORD, auth_user_id: OTHER_AUTH },
  ] as any;

  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'disputed',
      dispute_opened_at: '2026-05-19T22:00:00.000Z',
      dispute_resolution: null,
      dispute_resolved_at: null,
      dispute_opened_by: STAFF_INTERNAL_ID,
      dispute_resolved_by: null,
      dispute_reason: 'Internal staff reason — should NOT leak',
      team1_score: null,
      team2_score: null,
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      team1: { id: TEAM_1, name: 'Captained Team', captain_id: CAPTAIN_AUTH },
      team2: {
        id: TEAM_2,
        name: 'Other Team',
        captain_id: 'auth-other-captain',
      },
    },
    {
      id: MATCH_NO_DISPUTE,
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'pending',
      dispute_opened_at: null,
      dispute_resolution: null,
      dispute_resolved_at: null,
      team1_score: null,
      team2_score: null,
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      team1: { id: TEAM_1, name: 'Captained Team', captain_id: CAPTAIN_AUTH },
      team2: {
        id: TEAM_2,
        name: 'Other Team',
        captain_id: 'auth-other-captain',
      },
    },
  ] as any;

  store.match_score_reports = [
    {
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_ID,
      team_side: 1,
      team1_score: 3,
      team2_score: 1,
      discord_user_id: CAPTAIN_DISCORD,
      reported_at: '2026-05-19T21:50:00.000Z',
      updated_at: '2026-05-19T21:55:00.000Z',
    },
    {
      tenant_id: CONFERENCE_TENANT_ID,
      match_id: MATCH_ID,
      team_side: 2,
      team1_score: 2,
      team2_score: 3,
      discord_user_id: 'other-discord',
      reported_at: '2026-05-19T21:55:00.000Z',
      updated_at: null,
    },
  ] as any;
});

describe('GET /api/bot/v1/matches/[matchId]/dispute', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400 when matchId invalid', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        query: { matchId: 'abc', actorDiscordUserId: CAPTAIN_DISCORD },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when actorDiscordUserId missing', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { matchId: MATCH_ID } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('403 when actor is not a captain of either team', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        query: { matchId: MATCH_ID, actorDiscordUserId: NON_CAPTAIN_DISCORD },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('404 when match unknown', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        query: { matchId: UNKNOWN_MATCH, actorDiscordUserId: CAPTAIN_DISCORD },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when match has no dispute', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        query: {
          matchId: MATCH_NO_DISPUTE,
          actorDiscordUserId: CAPTAIN_DISCORD,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('happy path: returns dispute with reports + resolution=null', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.matchId).toBe(MATCH_ID);
    expect(body.status).toBe('disputed');
    expect(body.openedAt).toBe('2026-05-19T22:00:00.000Z');
    expect(body.reports.length).toBe(2);
    expect(body.staffNote).toBeNull();
    expect(body.resolution).toBeNull();

    // Each report has the expected shape
    const r1 = body.reports.find((r: any) => r.teamId === TEAM_1);
    expect(r1).toBeTruthy();
    expect(r1.teamName).toBe('Captained Team');
    expect(r1.scoreA).toBe(3);
    expect(r1.scoreB).toBe(1);
    expect(r1.submittedBy).toBe(CAPTAIN_DISCORD);
    expect(r1.submittedAt).toBe('2026-05-19T21:55:00.000Z');
  });

  it('does NOT leak internal staff fields (dispute_opened_by, dispute_reason, report.id)', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as any;
    const serialized = JSON.stringify(body);
    // Internal staff UUID is NOT in payload
    expect(serialized).not.toContain(STAFF_INTERNAL_ID);
    // Internal "reason" text NOT in payload
    expect(serialized).not.toContain('Internal staff reason');
    // No raw `dispute_opened_by` or `dispute_reason` keys
    expect(body).not.toHaveProperty('dispute_opened_by');
    expect(body).not.toHaveProperty('dispute_reason');
    expect(body).not.toHaveProperty('dispute_resolved_by');
    // Each report exposes only the documented fields
    for (const r of body.reports) {
      expect(Object.keys(r).sort()).toEqual(
        [
          'scoreA',
          'scoreB',
          'submittedAt',
          'submittedBy',
          'teamId',
          'teamName',
        ].sort()
      );
    }
  });

  it('captain on team2 also has access', async () => {
    store.user_discord_links = [
      ...(store.user_discord_links as any[]),
      {
        discord_user_id: '900000000000000099',
        auth_user_id: 'auth-other-captain',
      },
    ] as any;
    const res = makeRes();
    await handler(
      makeReq({
        query: { matchId: MATCH_ID, actorDiscordUserId: '900000000000000099' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('returns resolution block when resolved', async () => {
    (store.matches[0] as any).dispute_resolution = 'Final 2-1';
    (store.matches[0] as any).dispute_resolved_at = '2026-05-20T10:00:00.000Z';
    (store.matches[0] as any).team1_score = 2;
    (store.matches[0] as any).team2_score = 1;
    (store.matches[0] as any).status = 'finished';
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.staffNote).toBe('Final 2-1');
    expect(body.resolution).toEqual({
      resolvedAt: '2026-05-20T10:00:00.000Z',
      decidedScoreA: 2,
      decidedScoreB: 1,
    });
  });
});
