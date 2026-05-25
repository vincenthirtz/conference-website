// tests/unit/caster-runs-cues.test.ts
//
// Tests for /api/caster/runs/[runId]/cues (GET).
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// Behaviour:
//   - 200 returns the run's cues with acked_by_me hydrated.
//   - ?since=<iso> filters cues created_at > since.
//   - ?since=<invalid> → 400 INVALID_SINCE.
//   - ?limit clamps to [1..100].
//   - 404 when runId is unknown / cross-tenant.
//   - 409 when run is not live (draft/done).
//   - 401/403 when no auth.
//   - Cache-Control: private, no-store on success.

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

import cuesHandler from '../../pages/api/caster/runs/[runId]/cues';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';

const CAST_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const RUN_DRAFT = '11111111-1111-4111-8111-111111111112';
const RUN_DONE = '11111111-1111-4111-8111-111111111113';
const RUN_Y = '11111111-1111-4111-8111-111111111114';

const CUE_OLD = '22222222-2222-4222-8222-22222222aaaa';
const CUE_MID = '22222222-2222-4222-8222-22222222bbbb';
const CUE_NEW = '22222222-2222-4222-8222-22222222cccc';

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
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { runId: RUN_LIVE },
    body: {},
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
    { id: RUN_DONE, tenant_id: TENANT_X, status: 'done', name: 'Done', slug: 'done' },
    { id: RUN_Y, tenant_id: TENANT_Y, status: 'live', name: 'Other', slug: 'other' },
  ] as any;
  store.event_cues = [
    {
      id: CUE_OLD,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'info',
      body: 'Old cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T20:00:00.000Z',
      expires_at: null,
    },
    {
      id: CUE_MID,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'warn',
      body: 'Mid cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T20:01:00.000Z',
      expires_at: null,
    },
    {
      id: CUE_NEW,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      severity: 'urgent',
      body: 'New cue',
      created_by_user_id: 'mgr-1',
      created_at: '2026-05-21T20:02:00.000Z',
      expires_at: null,
    },
  ] as any;
  store.event_cue_acks = [
    {
      cue_id: CUE_MID,
      cast_member_id: CAST_X,
      tenant_id: TENANT_X,
      acked_at: '2026-05-21T20:01:30.000Z',
    },
  ] as any;
});

describe('GET /api/caster/runs/[runId]/cues', () => {
  it('200 returns cues for the run with acked_by_me hydrated', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: RUN_LIVE } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      cues: Array<{ id: string; acked_by_me: boolean }>;
    };
    expect(body.cues.length).toBe(3);

    const mid = body.cues.find((c) => c.id === CUE_MID);
    expect(mid).toBeDefined();
    expect(mid!.acked_by_me).toBe(true);

    const newCue = body.cues.find((c) => c.id === CUE_NEW);
    expect(newCue!.acked_by_me).toBe(false);
  });

  it('200 sets Cache-Control: private, no-store', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: RUN_LIVE } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('?since=<iso> filters out cues created at or before since', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: RUN_LIVE, since: '2026-05-21T20:01:00.000Z' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { cues: Array<{ id: string }> };
    // CUE_OLD (20:00) and CUE_MID (20:01 — exactly equal to since) are filtered;
    // only CUE_NEW (20:02) remains.
    expect(body.cues.map((c) => c.id)).toEqual([CUE_NEW]);
  });

  it('?since=<invalid> returns 400 INVALID_SINCE', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, since: 'not-an-iso' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_SINCE');
  });

  it('?limit=2 caps the result to 2 cues', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, limit: '2' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { cues: unknown[] };
    expect(body.cues.length).toBe(2);
  });

  it('?limit=500 is clamped to 100 (returns all available 3 cues)', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ query: { runId: RUN_LIVE, limit: '500' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { cues: unknown[] }).cues.length).toBe(3);
  });

  it('404 when runId is unknown', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: '99999999-9999-4999-8999-999999999999' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when run belongs to another tenant (cross-tenant leak protection)', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: RUN_Y } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('409 when run is not live (draft)', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: RUN_DRAFT } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_LIVE');
  });

  it('409 when run is done', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: RUN_DONE } }), res);
    expect(res.statusCode).toBe(409);
  });

  it('400 on invalid runId (not a UUID)', async () => {
    const res = makeRes();
    await cuesHandler(makeAuthedReq({ query: { runId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects without auth (401 or 403 from caster wrapper)', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ headers: { host: 'h' }, query: { runId: RUN_LIVE } }),
      res
    );
    expect([401, 403]).toContain(res.statusCode);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ method: 'POST', query: { runId: RUN_LIVE } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
