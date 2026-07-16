// Tests for admin run-of-show endpoints (Lot 2 — feature run-of-show).
//
// Covered :
//   - POST /api/admin/events/[runId]/segments/[segId]/start
//       → happy path (upcoming → live, outbox event emitted)
//       → idempotent no-op when already live
//       → 409 when segment status is wrong
//       → 404 when segment id is unknown
//   - POST /api/admin/events/[runId]/segments/reorder
//       → happy path (reorders and reassigns ord 0..N-1)
//       → 400 when orderedIds is incomplete
//       → 400 when orderedIds contains a foreign segment

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

import segStartHandler from '../../pages/api/admin/events/[runId]/segments/[segId]/start';
import segReorderHandler from '../../pages/api/admin/events/[runId]/segments/reorder';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(role: 'admin' = 'admin'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
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
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
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

// V4-compatible UUIDs : version nibble = 4, variant nibble in [8,9,a,b].
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SEG_A = '22222222-2222-4222-8222-22222222aaaa';
const SEG_B = '22222222-2222-4222-8222-22222222bbbb';
const SEG_C = '22222222-2222-4222-8222-22222222cccc';
// DEFAULT_TENANT_ID literal — matches utils/tenant.ts default fallback.
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function seedRunWithSegments() {
  store.event_runs = [
    {
      id: RUN_ID,
      tenant_id: TENANT,
      status: 'live',
      name: 'Show',
      slug: 'show',
      scheduled_at: '2026-05-21T20:00:00.000Z',
      description: null,
      started_at: '2026-05-21T20:00:00.000Z',
      ended_at: null,
    },
  ] as any;

  store.event_segments = [
    {
      id: SEG_A,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 0,
      type: 'intro',
      match_id: null,
      title: 'Intro',
      duration_min: 5,
      status: 'upcoming',
      started_at: null,
      ended_at: null,
      broadcast_message: null,
      caster_checklist: [],
    },
    {
      id: SEG_B,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 1,
      type: 'match',
      match_id: '33333333-3333-3333-3333-333333333333',
      title: 'Match 1',
      duration_min: 45,
      status: 'upcoming',
      started_at: null,
      ended_at: null,
      broadcast_message: {
        discord: 'Match 1 starting!',
      },
      caster_checklist: [],
    },
    {
      id: SEG_C,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 2,
      type: 'outro',
      match_id: null,
      title: 'Outro',
      duration_min: 5,
      status: 'upcoming',
      started_at: null,
      ended_at: null,
      broadcast_message: null,
      caster_checklist: [],
    },
  ] as any;

  store.bot_event_outbox = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/events/[runId]/segments/[segId]/start
 * ---------------------------------------------------------*/

describe('POST /api/admin/events/[runId]/segments/[segId]/start', () => {
  it('transitions upcoming → live and emits an outbox event', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segStartHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID, segId: SEG_B },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { segment: any; alreadyStarted: boolean };
    expect(body.alreadyStarted).toBe(false);
    expect(body.segment.status).toBe('live');
    expect(body.segment.started_at).toBeTruthy();

    // Outbox row pondue.
    // Mock writes the side-effect synchronously after the response, but
    // because emitSegmentTransitioned is fire-and-forget we wait a tick.
    await new Promise((r) => setImmediate(r));
    const outbox = store.bot_event_outbox as any[];
    expect(outbox.length).toBeGreaterThan(0);
    const evt = outbox[outbox.length - 1];
    expect(evt.event_name).toBe('event_segment.transitioned');
    expect(evt.tenant_id).toBe(TENANT);
    expect(evt.status).toBe('pending');
    expect(evt.payload.event).toBe('event_segment.transitioned');
    expect(evt.payload.data.fromStatus).toBe('upcoming');
    expect(evt.payload.data.toStatus).toBe('live');
    expect(evt.payload.data.segmentId).toBe(SEG_B);
    expect(evt.payload.data.runId).toBe(RUN_ID);
    expect(evt.payload.data.broadcastMessage).toEqual({
      discord: 'Match 1 starting!',
    });
  });

  it('is idempotent when segment already live', async () => {
    seedRunWithSegments();
    // Force segment to live first.
    (store.event_segments as any[]).find((s) => s.id === SEG_B).status = 'live';
    (store.event_segments as any[]).find((s) => s.id === SEG_B).started_at =
      '2026-05-21T20:00:00.000Z';

    const res = makeRes();
    await segStartHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID, segId: SEG_B },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { alreadyStarted: boolean };
    expect(body.alreadyStarted).toBe(true);

    // No new outbox row for the no-op.
    await new Promise((r) => setImmediate(r));
    expect((store.bot_event_outbox as any[]).length).toBe(0);
  });

  it('returns 409 when segment is in a non-startable state', async () => {
    seedRunWithSegments();
    (store.event_segments as any[]).find((s) => s.id === SEG_B).status = 'done';

    const res = makeRes();
    await segStartHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID, segId: SEG_B },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    const body = res.body as { code?: string };
    expect(body.code).toBe('SEGMENT_NOT_UPCOMING');
  });

  it('returns 404 when segment is not found', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segStartHandler(
      makeAuthedReq({
        method: 'POST',
        query: {
          runId: RUN_ID,
          segId: '99999999-9999-4999-8999-999999999999',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 on invalid segId', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segStartHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID, segId: 'not-a-uuid' },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/admin/events/[runId]/segments/reorder
 * ---------------------------------------------------------*/

describe('POST /api/admin/events/[runId]/segments/reorder', () => {
  it('reorders segments to 0..N-1 in the requested order', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segReorderHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID },
        body: { orderedIds: [SEG_C, SEG_A, SEG_B] },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const final = store.event_segments as any[];
    const map = new Map(final.map((s) => [s.id, s.ord]));
    expect(map.get(SEG_C)).toBe(0);
    expect(map.get(SEG_A)).toBe(1);
    expect(map.get(SEG_B)).toBe(2);
  });

  it('returns 400 when orderedIds is missing a segment from the run', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segReorderHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID },
        body: { orderedIds: [SEG_A, SEG_B] }, // SEG_C absent
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string };
    expect(body.code).toBe('INCOMPLETE_REORDER');
  });

  it('returns 400 when orderedIds contains a foreign segment', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segReorderHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID },
        body: {
          orderedIds: [SEG_A, SEG_B, '99999999-9999-4999-8999-999999999999'],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string };
    expect(body.code).toBe('SEGMENT_NOT_IN_RUN');
  });

  it('returns 400 when orderedIds has duplicates', async () => {
    seedRunWithSegments();

    const res = makeRes();
    await segReorderHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: RUN_ID },
        body: { orderedIds: [SEG_A, SEG_A, SEG_B] },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    const body = res.body as { code?: string };
    expect(body.code).toBe('DUPLICATE_IDS');
  });

  it('returns 404 when run does not exist', async () => {
    // No seed.
    const res = makeRes();
    await segReorderHandler(
      makeAuthedReq({
        method: 'POST',
        query: { runId: '44444444-4444-4444-8444-444444444444' },
        body: { orderedIds: [SEG_A] },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
  });
});
