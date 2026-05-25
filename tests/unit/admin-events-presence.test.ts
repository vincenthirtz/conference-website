// tests/unit/admin-events-presence.test.ts
//
// Tests for /api/admin/events/[runId]/presence (GET).
// Feature: Run-of-show — Lot 5 (cues + presence).
//
// Behaviour:
//   - 200 returns all casters assigned to the run (segments → matches →
//     cast_assignments → cast_members).
//   - Status derived server-side from last_seen_at delta:
//       * < 60s   → 'online'
//       * 60–180s → 'idle'
//       * > 180s  → 'offline'
//       * no row  → 'unknown'
//   - event_run_id mismatch on caster_presence → 'unknown'.
//   - 404 when runId unknown / cross-tenant.
//   - 403 when staff role < manager.

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

import presenceHandler from '../../pages/api/admin/events/[runId]/presence';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';
const RUN_LIVE = '11111111-1111-4111-8111-111111111111';
const RUN_OTHER_TENANT = '11111111-1111-4111-8111-111111111114';
const SEG_MATCH_1 = '22222222-2222-4222-8222-22222222aaaa';
const SEG_INTRO = '22222222-2222-4222-8222-22222222bbbb';
const MATCH_1 = '44444444-4444-4444-8444-44444444aaaa';
const CASTER_ONLINE = '33333333-3333-4333-8333-333333330001';
const CASTER_IDLE = '33333333-3333-4333-8333-333333330002';
const CASTER_OFFLINE = '33333333-3333-4333-8333-333333330003';
const CASTER_UNKNOWN_NOROW = '33333333-3333-4333-8333-333333330004';
const CASTER_UNKNOWN_MISMATCH = '33333333-3333-4333-8333-333333330005';

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
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer ${freshToken()}`,
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

function isoAgo(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function seedBaseTopology() {
  store.event_runs = [
    {
      id: RUN_LIVE,
      tenant_id: TENANT_X,
      status: 'live',
      name: 'Show',
      slug: 'show',
    },
    {
      id: RUN_OTHER_TENANT,
      tenant_id: TENANT_Y,
      status: 'live',
      name: 'Other tenant',
      slug: 'other',
    },
  ] as any;

  store.event_segments = [
    {
      id: SEG_MATCH_1,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      type: 'match',
      match_id: MATCH_1,
      title: 'Final',
    },
    {
      id: SEG_INTRO,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      type: 'intro',
      match_id: null,
      title: 'Intro',
    },
  ] as any;

  store.cast_assignments = [
    {
      id: 'a1',
      tenant_id: TENANT_X,
      match_id: MATCH_1,
      cast_member_id: CASTER_ONLINE,
    },
    {
      id: 'a2',
      tenant_id: TENANT_X,
      match_id: MATCH_1,
      cast_member_id: CASTER_IDLE,
    },
    {
      id: 'a3',
      tenant_id: TENANT_X,
      match_id: MATCH_1,
      cast_member_id: CASTER_OFFLINE,
    },
    {
      id: 'a4',
      tenant_id: TENANT_X,
      match_id: MATCH_1,
      cast_member_id: CASTER_UNKNOWN_NOROW,
    },
    {
      id: 'a5',
      tenant_id: TENANT_X,
      match_id: MATCH_1,
      cast_member_id: CASTER_UNKNOWN_MISMATCH,
    },
  ] as any;

  store.cast_members = [
    {
      id: CASTER_ONLINE,
      tenant_id: TENANT_X,
      name: 'A Online',
      image_url: null,
      is_active: true,
    },
    {
      id: CASTER_IDLE,
      tenant_id: TENANT_X,
      name: 'B Idle',
      image_url: null,
      is_active: true,
    },
    {
      id: CASTER_OFFLINE,
      tenant_id: TENANT_X,
      name: 'C Offline',
      image_url: null,
      is_active: true,
    },
    {
      id: CASTER_UNKNOWN_NOROW,
      tenant_id: TENANT_X,
      name: 'D No-row',
      image_url: null,
      is_active: true,
    },
    {
      id: CASTER_UNKNOWN_MISMATCH,
      tenant_id: TENANT_X,
      name: 'E Mismatch',
      image_url: null,
      is_active: true,
    },
  ] as any;

  store.caster_presence = [
    {
      cast_member_id: CASTER_ONLINE,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      last_seen_at: isoAgo(10_000), // 10s ago → online
      user_agent: 'cockpit/1.0',
    },
    {
      cast_member_id: CASTER_IDLE,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      last_seen_at: isoAgo(120_000), // 2m ago → idle (60–180s)
      user_agent: null,
    },
    {
      cast_member_id: CASTER_OFFLINE,
      tenant_id: TENANT_X,
      event_run_id: RUN_LIVE,
      last_seen_at: isoAgo(600_000), // 10m ago → offline
      user_agent: null,
    },
    // CASTER_UNKNOWN_NOROW intentionally absent.
    {
      cast_member_id: CASTER_UNKNOWN_MISMATCH,
      tenant_id: TENANT_X,
      event_run_id: '99999999-9999-4999-8999-999999999999', // different run
      last_seen_at: isoAgo(10_000),
      user_agent: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

/* ===========================================================
 * GET /api/admin/events/[runId]/presence
 * =========================================================*/

describe('GET /api/admin/events/[runId]/presence', () => {
  it('200 returns every caster assigned to the run with derived status', async () => {
    seedBaseTopology();

    const res = makeRes();
    await presenceHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      presence: Array<{
        cast_member_id: string;
        name: string;
        status: 'online' | 'idle' | 'offline' | 'unknown';
        last_seen_at: string | null;
        user_agent?: string;
      }>;
    };
    expect(body.presence.length).toBe(5);

    const byId = new Map(body.presence.map((p) => [p.cast_member_id, p]));
    expect(byId.get(CASTER_ONLINE)!.status).toBe('online');
    expect(byId.get(CASTER_IDLE)!.status).toBe('idle');
    expect(byId.get(CASTER_OFFLINE)!.status).toBe('offline');
    expect(byId.get(CASTER_UNKNOWN_NOROW)!.status).toBe('unknown');
    expect(byId.get(CASTER_UNKNOWN_NOROW)!.last_seen_at).toBeNull();
    expect(byId.get(CASTER_UNKNOWN_MISMATCH)!.status).toBe('unknown');

    expect(byId.get(CASTER_ONLINE)!.user_agent).toBe('cockpit/1.0');
  });

  it("event_run_id mismatch on caster_presence → 'unknown' (caster not on THIS run)", async () => {
    seedBaseTopology();
    const res = makeRes();
    await presenceHandler(makeAuthedReq(), res);
    const body = res.body as {
      presence: Array<{ cast_member_id: string; status: string }>;
    };
    const mismatch = body.presence.find(
      (p) => p.cast_member_id === CASTER_UNKNOWN_MISMATCH
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.status).toBe('unknown');
  });

  it('returns empty array when no segments have matches assigned', async () => {
    seedBaseTopology();
    store.cast_assignments = [] as any;

    const res = makeRes();
    await presenceHandler(makeAuthedReq(), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).presence).toEqual([]);
  });

  it('404 when runId is unknown', async () => {
    seedBaseTopology();
    const res = makeRes();
    await presenceHandler(
      makeAuthedReq({
        query: { runId: '99999999-9999-4999-8999-999999999999' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when run belongs to another tenant (cross-tenant leak protection)', async () => {
    seedBaseTopology();
    const res = makeRes();
    await presenceHandler(
      makeAuthedReq({ query: { runId: RUN_OTHER_TENANT } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('403 when staff role is caster (below manager)', async () => {
    seedBaseTopology();
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();

    const res = makeRes();
    await presenceHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(403);
  });
});
