// tests/unit/caster-heartbeat.test.ts
//
// Tests for /api/caster/heartbeat (POST).
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// Behaviour:
//   - 200 on first heartbeat: caster_presence created with tenant + event_run_id
//     + last_seen_at recent + user_agent captured (truncated to 500).
//   - 200 on subsequent heartbeat: UPSERT updates last_seen_at + user_agent
//     (single row preserved on PK cast_member_id).
//   - 200 with event_run_id=null (caster on cockpit without active run).
//   - 400 when event_run_id is provided but the run is unknown / cross-tenant.
//   - 400 when event_run_id is provided but the run is not 'live'.
//   - 401/403 when no auth.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import heartbeatHandler from '../../pages/api/caster/heartbeat';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';

const CAST_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const RUN_DRAFT = '11111111-1111-4111-8111-111111111112';
const RUN_OTHER_TENANT = '11111111-1111-4111-8111-111111111199';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-caster-x',
    auth_user_id: 'user-caster-x',
    email: 'caster@x.com',
    role: 'caster',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `tk-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      authorization: `Bearer ${freshToken()}`,
      'user-agent': 'CockpitTestAgent/1.0',
    },
    query: {},
    body: { event_run_id: RUN_LIVE },
    cookies: {},
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
  invalidateStaffCache();
  setAuthUser({ id: 'user-caster-x' });
  store.staff = [makeStaffRow()] as any;
  store.cast_members = [
    {
      id: CAST_X,
      auth_user_id: 'user-caster-x',
      tenant_id: TENANT_X,
      is_active: true,
      name: 'Caster X',
      title: null,
      description: null,
      image_url: null,
      twitch_url: null,
      city: null,
    },
  ] as any;
  store.event_runs = [
    { id: RUN_LIVE, tenant_id: TENANT_X, status: 'live', name: 'Live', slug: 'live' },
    { id: RUN_DRAFT, tenant_id: TENANT_X, status: 'draft', name: 'Draft', slug: 'draft' },
    { id: RUN_OTHER_TENANT, tenant_id: TENANT_Y, status: 'live', name: 'Other', slug: 'other' },
  ] as any;
  store.caster_presence = [] as any;
});

describe('POST /api/caster/heartbeat', () => {
  it('200 on first heartbeat — caster_presence row created with tenant + run + user_agent', async () => {
    const res = makeRes();
    await heartbeatHandler(makeAuthedReq({ body: { event_run_id: RUN_LIVE } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      presence: { cast_member_id: string; event_run_id: string | null };
    };
    expect(body.presence.cast_member_id).toBe(CAST_X);
    expect(body.presence.event_run_id).toBe(RUN_LIVE);

    expect((store.caster_presence as any[]).length).toBe(1);
    const row = (store.caster_presence as any[])[0];
    expect(row.cast_member_id).toBe(CAST_X);
    expect(row.tenant_id).toBe(TENANT_X);
    expect(row.event_run_id).toBe(RUN_LIVE);
    expect(row.user_agent).toBe('CockpitTestAgent/1.0');
  });

  it('200 on subsequent heartbeat — UPSERT keeps a single row and updates last_seen_at', async () => {
    const res1 = makeRes();
    await heartbeatHandler(makeAuthedReq({ body: { event_run_id: RUN_LIVE } }), res1);
    expect(res1.statusCode).toBe(200);
    expect((store.caster_presence as any[]).length).toBe(1);
    const firstSeen = (store.caster_presence as any[])[0].last_seen_at as string;

    // Wait a hair to ensure a different ISO timestamp on the second call.
    await new Promise((r) => setTimeout(r, 5));

    const res2 = makeRes();
    await heartbeatHandler(
      makeAuthedReq({
        body: { event_run_id: RUN_LIVE },
        headers: {
          host: 'h',
          authorization: `Bearer ${freshToken()}`,
          'user-agent': 'CockpitTestAgent/2.0',
        },
      }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    expect((store.caster_presence as any[]).length).toBe(1); // no duplicate
    const updated = (store.caster_presence as any[])[0];
    expect(updated.user_agent).toBe('CockpitTestAgent/2.0');
    expect(updated.last_seen_at).not.toBe(firstSeen);
  });

  it('200 with event_run_id=null (caster on cockpit without active run)', async () => {
    const res = makeRes();
    await heartbeatHandler(makeAuthedReq({ body: { event_run_id: null } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { presence: { event_run_id: string | null } };
    expect(body.presence.event_run_id).toBeNull();

    const row = (store.caster_presence as any[])[0];
    expect(row.event_run_id).toBeNull();
  });

  it('200 with event_run_id omitted entirely (defaults to null)', async () => {
    const res = makeRes();
    await heartbeatHandler(makeAuthedReq({ body: {} }), res);
    expect(res.statusCode).toBe(200);
    const row = (store.caster_presence as any[])[0];
    expect(row.event_run_id).toBeNull();
  });

  it('400 when event_run_id refers to an unknown / cross-tenant run', async () => {
    const res = makeRes();
    await heartbeatHandler(
      makeAuthedReq({ body: { event_run_id: RUN_OTHER_TENANT } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_FOUND');
    expect((store.caster_presence as any[]).length).toBe(0);
  });

  it('400 when event_run_id refers to a run that is not live (draft)', async () => {
    const res = makeRes();
    await heartbeatHandler(
      makeAuthedReq({ body: { event_run_id: RUN_DRAFT } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_LIVE');
    expect((store.caster_presence as any[]).length).toBe(0);
  });

  it('400 when event_run_id is not a UUID', async () => {
    const res = makeRes();
    await heartbeatHandler(
      makeAuthedReq({ body: { event_run_id: 'not-a-uuid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('rejects without auth (401 or 403 from caster wrapper)', async () => {
    const res = makeRes();
    await heartbeatHandler(
      makeAuthedReq({ headers: { host: 'h', 'user-agent': 'x' } }),
      res
    );
    expect([401, 403]).toContain(res.statusCode);
  });

  it('405 on GET', async () => {
    const res = makeRes();
    await heartbeatHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
