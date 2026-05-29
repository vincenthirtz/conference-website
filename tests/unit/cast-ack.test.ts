// tests/unit/cast-ack.test.ts
// POST /api/bot/v1/cast/[assignmentId]/ack

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/cast/[assignmentId]/ack';

const ASSIGN_ID = '550e8400-e29b-41d4-a716-446655440b01';
const ASSIGN_ID_ACKED = '550e8400-e29b-41d4-a716-446655440b02';
const UNKNOWN_ID = '550e8400-e29b-41d4-a716-44665544ffff';
const CAST_MEMBER = '550e8400-e29b-41d4-a716-446655440c01';
const CASTER_AUTH = 'auth-caster-a';
const OTHER_AUTH = 'auth-other';
const CASTER_DISCORD = '900000000000000001';
const OTHER_DISCORD = '900000000000000002';
// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts. The
// bot route gates lookups by tenant_id (multi-tenant S3 sweep).
const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: { assignmentId: ASSIGN_ID },
    body: { actorDiscordUserId: CASTER_DISCORD },
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
  store.cast_assignments = [
    {
      id: ASSIGN_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      cast_member_id: CAST_MEMBER,
      acked_at: null,
      cast_member: { id: CAST_MEMBER, auth_user_id: CASTER_AUTH },
    },
    {
      id: ASSIGN_ID_ACKED,
      tenant_id: CONFERENCE_TENANT_ID,
      cast_member_id: CAST_MEMBER,
      acked_at: '2026-05-19T20:00:00.000Z',
      cast_member: { id: CAST_MEMBER, auth_user_id: CASTER_AUTH },
    },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CASTER_AUTH, discord_user_id: CASTER_DISCORD },
    { auth_user_id: OTHER_AUTH, discord_user_id: OTHER_DISCORD },
  ] as any;
});

describe('POST /api/bot/v1/cast/[assignmentId]/ack', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('400 with malformed assignmentId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { assignmentId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 with malformed actorDiscordUserId', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { actorDiscordUserId: 'abc' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 when assignment unknown', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { assignmentId: UNKNOWN_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('403 when actor is not the caster', async () => {
    const res = makeRes();
    await handler(
      makeReq({ body: { actorDiscordUserId: OTHER_DISCORD } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('happy path: marks acked_at = now() and returns alreadyAcked=false', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.assignmentId).toBe(ASSIGN_ID);
    expect(body.alreadyAcked).toBe(false);
    expect(body.ackedAt).toBeTruthy();
    // store mutated
    const row = store.cast_assignments.find((r: any) => r.id === ASSIGN_ID);
    expect((row as any).acked_at).toBeTruthy();
  });

  it('idempotent: second call returns 200 alreadyAcked=true (same ackedAt)', async () => {
    const res1 = makeRes();
    await handler(makeReq(), res1);
    expect(res1.statusCode).toBe(200);
    const firstAck = (res1.body as any).ackedAt;

    const res2 = makeRes();
    await handler(makeReq(), res2);
    expect(res2.statusCode).toBe(200);
    expect((res2.body as any).alreadyAcked).toBe(true);
    // The originally stored value is preserved (not overwritten)
    expect((res2.body as any).ackedAt).toBe(firstAck);
  });

  it('200 idempotent on pre-acked assignment', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { assignmentId: ASSIGN_ID_ACKED } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).alreadyAcked).toBe(true);
    expect((res.body as any).ackedAt).toBe('2026-05-19T20:00:00.000Z');
  });
});
