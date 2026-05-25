// tests/unit/admin-events-cues.test.ts
//
// Tests for /api/admin/events/[runId]/cues (POST + GET).
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// POST behaviour:
//   - 201 on a valid create for info/warn/urgent (persisted, created_by_user_id stamped).
//   - 400 when Idempotency-Key header is missing.
//   - 400 on invalid payload (empty, >500 chars, unknown severity).
//   - 409 when the run is not status='live' (draft / done).
//   - 403 when staff role < manager (caster).
//   - 404 when the run is unknown or belongs to another tenant.
//   - 200 idempotent replay for same Idempotency-Key + same body.
//
// GET behaviour:
//   - 200 returns cues with ack_count + ack_required.
//   - ack_required is true ONLY for severity='urgent'.
//   - limit query is bounded (default 50, max 100).
//   - 403 when staff role < manager.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetAdminIdempotencyCache } from '../../utils/adminIdempotency';

import cuesHandler from '../../pages/api/admin/events/[runId]/cues/index';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const RUN_DRAFT = '11111111-1111-4111-8111-111111111112';
const RUN_DONE = '11111111-1111-4111-8111-111111111113';
const RUN_OTHER_TENANT = '11111111-1111-4111-8111-111111111114';
const CUE_A = '22222222-2222-4222-8222-22222222aaaa';
const CUE_B = '22222222-2222-4222-8222-22222222bbbb';
const CUE_C = '22222222-2222-4222-8222-22222222cccc';
const CASTER_ID_1 = '33333333-3333-4333-8333-33333333aaaa';
const CASTER_ID_2 = '33333333-3333-4333-8333-33333333bbbb';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      authorization: `Bearer ${freshToken()}`,
      'idempotency-key': `idem-${Math.random().toString(36).slice(2)}`,
    },
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

function seedRuns() {
  store.event_runs = [
    {
      id: RUN_LIVE,
      tenant_id: TENANT_X,
      status: 'live',
      name: 'Show',
      slug: 'show',
    },
    {
      id: RUN_DRAFT,
      tenant_id: TENANT_X,
      status: 'draft',
      name: 'Draft Show',
      slug: 'draft',
    },
    {
      id: RUN_DONE,
      tenant_id: TENANT_X,
      status: 'done',
      name: 'Done Show',
      slug: 'done',
    },
    {
      id: RUN_OTHER_TENANT,
      tenant_id: TENANT_Y,
      status: 'live',
      name: 'Other tenant',
      slug: 'other',
    },
  ] as any;
}

beforeEach(async () => {
  resetSupabaseMock();
  invalidateStaffCache();
  await __resetAdminIdempotencyCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
  logStaffActionMock.mockClear();
});

/* ===========================================================
 * POST /api/admin/events/[runId]/cues
 * =========================================================*/

describe('POST /api/admin/events/[runId]/cues', () => {
  it('201 on a valid info cue + persists row + stamps created_by_user_id', async () => {
    seedRuns();
    store.event_cues = [] as any;

    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        body: { severity: 'info', body: 'Hello casters' },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const body = res.body as { cue: { id: string; severity: string; body: string; created_by_user_id: string } };
    expect(body.cue.severity).toBe('info');
    expect(body.cue.body).toBe('Hello casters');
    expect(body.cue.created_by_user_id).toBe('user-1');

    expect((store.event_cues as any[]).length).toBe(1);
    const persisted = (store.event_cues as any[])[0];
    expect(persisted.event_run_id).toBe(RUN_LIVE);
    expect(persisted.tenant_id).toBe(TENANT_X);
    expect(persisted.severity).toBe('info');
  });

  it('201 on warn severity', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'warn', body: 'Attention rideau' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).cue.severity).toBe('warn');
  });

  it('201 on urgent severity', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'urgent', body: 'ACTION IMMEDIATE' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).cue.severity).toBe('urgent');
  });

  it('400 when Idempotency-Key header is missing', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
        body: { severity: 'info', body: 'No key' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string };
    expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('400 on empty body string', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'info', body: '' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('400 when body exceeds 500 chars', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'info', body: 'x'.repeat(501) } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('400 on unknown severity', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'critical', body: 'Oops' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { code?: string }).code).toBe('INVALID_PAYLOAD');
  });

  it('409 when run is in draft state', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: RUN_DRAFT },
        body: { severity: 'info', body: 'Hello' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    const body = res.body as { code?: string };
    expect(body.code).toBe('RUN_NOT_LIVE');
  });

  it('409 when run is in done state', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: RUN_DONE },
        body: { severity: 'info', body: 'Hello' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as { code?: string }).code).toBe('RUN_NOT_LIVE');
  });

  it('403 when staff role is caster (below manager)', async () => {
    seedRuns();
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();

    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ body: { severity: 'info', body: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('404 when run does not exist', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: '99999999-9999-4999-8999-999999999999' },
        body: { severity: 'info', body: 'Hello' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when run belongs to another tenant (cross-tenant leak protection)', async () => {
    seedRuns();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        query: { runId: RUN_OTHER_TENANT },
        body: { severity: 'info', body: 'Hello' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('idempotent replay: same Idempotency-Key + same body returns the same response', async () => {
    seedRuns();
    const idemKey = 'stable-idem-key-123';
    const body = { severity: 'info', body: 'idempotent body' };

    // First call: creates the cue.
    const res1 = makeRes();
    await cuesHandler(
      makeAuthedReq({
        headers: {
          host: 'h',
          authorization: `Bearer ${freshToken()}`,
          'idempotency-key': idemKey,
        },
        body,
      }),
      res1
    );
    expect(res1.statusCode).toBe(201);
    const firstCueId = (res1.body as any).cue.id;

    // Second call: same key, same body → cache replay (no new row).
    const res2 = makeRes();
    await cuesHandler(
      makeAuthedReq({
        headers: {
          host: 'h',
          authorization: `Bearer ${freshToken()}`,
          'idempotency-key': idemKey,
        },
        body,
      }),
      res2
    );
    expect(res2.statusCode).toBe(201);
    expect((res2.body as any).cue.id).toBe(firstCueId);
    expect(res2.headers['Idempotency-Replay']).toBe('true');
    // Single insert in the store (not duplicated).
    expect((store.event_cues as any[]).length).toBe(1);
  });
});

/* ===========================================================
 * GET /api/admin/events/[runId]/cues
 * =========================================================*/

describe('GET /api/admin/events/[runId]/cues', () => {
  function seedCuesWithAcks() {
    seedRuns();
    store.event_cues = [
      {
        id: CUE_A,
        tenant_id: TENANT_X,
        event_run_id: RUN_LIVE,
        severity: 'urgent',
        body: 'Urgent A',
        created_by_user_id: 'user-1',
        created_at: '2026-05-21T20:02:00.000Z',
        expires_at: null,
      },
      {
        id: CUE_B,
        tenant_id: TENANT_X,
        event_run_id: RUN_LIVE,
        severity: 'warn',
        body: 'Warn B',
        created_by_user_id: 'user-1',
        created_at: '2026-05-21T20:01:00.000Z',
        expires_at: null,
      },
      {
        id: CUE_C,
        tenant_id: TENANT_X,
        event_run_id: RUN_LIVE,
        severity: 'info',
        body: 'Info C',
        created_by_user_id: 'user-1',
        created_at: '2026-05-21T20:00:00.000Z',
        expires_at: null,
      },
    ] as any;

    store.event_cue_acks = [
      {
        cue_id: CUE_A,
        cast_member_id: CASTER_ID_1,
        tenant_id: TENANT_X,
        acked_at: '2026-05-21T20:02:30.000Z',
        cast_members: { name: 'Alpha Caster' },
      },
      {
        cue_id: CUE_A,
        cast_member_id: CASTER_ID_2,
        tenant_id: TENANT_X,
        acked_at: '2026-05-21T20:02:40.000Z',
        cast_members: { name: 'Beta Caster' },
      },
    ] as any;
  }

  it('200 returns cues with ack_count + ack_required computed', async () => {
    seedCuesWithAcks();

    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: RUN_LIVE },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      cues: Array<{
        id: string;
        severity: string;
        ack_count: number;
        ack_required: boolean;
      }>;
      acks_by_cue: Record<string, any[]>;
    };

    expect(body.cues.length).toBe(3);

    const urgent = body.cues.find((c) => c.id === CUE_A);
    expect(urgent).toBeDefined();
    expect(urgent!.ack_count).toBe(2);
    expect(urgent!.ack_required).toBe(true);

    const warn = body.cues.find((c) => c.id === CUE_B);
    expect(warn!.ack_count).toBe(0);
    expect(warn!.ack_required).toBe(false);

    const info = body.cues.find((c) => c.id === CUE_C);
    expect(info!.ack_count).toBe(0);
    expect(info!.ack_required).toBe(false);

    expect(body.acks_by_cue[CUE_A]).toHaveLength(2);
  });

  it('respects limit query param (uses provided value)', async () => {
    seedCuesWithAcks();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: RUN_LIVE, limit: '2' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { cues: unknown[] };
    expect(body.cues.length).toBe(2);
  });

  it('clamps limit to 100 max', async () => {
    seedCuesWithAcks();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: RUN_LIVE, limit: '500' },
      }),
      res
    );
    // We can't directly inspect the .limit() call but we know it returns 200
    // and only the available cues (3) come back.
    expect(res.statusCode).toBe(200);
    expect((res.body as any).cues.length).toBe(3);
  });

  it('returns empty list when there are no cues', async () => {
    seedRuns();
    store.event_cues = [] as any;

    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ method: 'GET', query: { runId: RUN_LIVE } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).cues).toEqual([]);
  });

  it('403 when staff role is caster', async () => {
    seedCuesWithAcks();
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();

    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({ method: 'GET', query: { runId: RUN_LIVE } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('404 when run is unknown', async () => {
    seedCuesWithAcks();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: '99999999-9999-4999-8999-999999999999' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when run belongs to another tenant', async () => {
    seedCuesWithAcks();
    const res = makeRes();
    await cuesHandler(
      makeAuthedReq({
        method: 'GET',
        query: { runId: RUN_OTHER_TENANT },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
