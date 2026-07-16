// Tests for POST /api/admin/broadcast/next-match
// (Feature: Production broadcast automatisée).
//
// Advances the live run to the next `type='match'` segment by ord (skipping
// non-match segments), atomically closing the current live segment. 409s when
// no live run / no current segment / no next match.

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import nextMatchHandler from '../../pages/api/admin/broadcast/next-match';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SEG_CUR = '22222222-2222-4222-8222-2222222222a0'; // ord 1, match, live
const SEG_BREAK = '22222222-2222-4222-8222-2222222222b0'; // ord 2, break, upcoming
const SEG_NEXT = '22222222-2222-4222-8222-2222222222c0'; // ord 3, match, upcoming

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
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
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
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

function seedRun(opts: { withNextMatch?: boolean } = {}) {
  store.event_runs = [
    {
      id: RUN_ID,
      tenant_id: TENANT,
      name: 'Show',
      slug: 'show',
      status: 'live',
      started_at: '2026-05-25T18:00:00Z',
      scheduled_at: null,
      broadcast_state: {
        v: 1,
        on_air: true,
        lower_third: null,
        pip: { enabled: false },
        scene: 'match',
        auto_director: true,
        scene_updated_at: null,
      },
    },
  ] as any;

  const segs: any[] = [
    {
      id: SEG_CUR,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 1,
      type: 'match',
      title: 'Match 1',
      match_id: '33333333-3333-4333-8333-333333333331',
      duration_min: 45,
      status: 'live',
      started_at: '2026-05-25T18:00:00Z',
      ended_at: null,
      broadcast_message: null,
      caster_checklist: [],
    },
    {
      id: SEG_BREAK,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 2,
      type: 'break',
      title: 'Pause',
      match_id: null,
      duration_min: 10,
      status: 'upcoming',
      started_at: null,
      ended_at: null,
      broadcast_message: null,
      caster_checklist: [],
    },
  ];
  if (opts.withNextMatch !== false) {
    segs.push({
      id: SEG_NEXT,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 3,
      type: 'match',
      title: 'Match 2',
      match_id: '33333333-3333-4333-8333-333333333332',
      duration_min: 45,
      status: 'upcoming',
      started_at: null,
      ended_at: null,
      broadcast_message: { discord: 'Match 2!' },
      caster_checklist: [],
    });
  }
  store.event_segments = segs as any;
  store.bot_event_outbox = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

describe('POST /api/admin/broadcast/next-match', () => {
  it('advances to the next match segment, skipping the break, atomically closing the old live segment', async () => {
    seedRun();
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.segment.id).toBe(SEG_NEXT);
    expect(body.segment.status).toBe('live');
    expect(body.segment.ord).toBe(3);

    // Old live segment closed.
    const segs = store.event_segments as any[];
    const old = segs.find((s) => s.id === SEG_CUR);
    expect(old.status).toBe('done');
    expect(old.ended_at).toBeTruthy();
    // Break untouched.
    expect(segs.find((s) => s.id === SEG_BREAK).status).toBe('upcoming');

    // Scene reset to 'starting'.
    const run = (store.event_runs as any[]).find((r) => r.id === RUN_ID);
    expect(run.broadcast_state.scene).toBe('starting');
  });

  it('emits event_segment.transitioned for the promoted match', async () => {
    seedRun();
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    await new Promise((r) => setImmediate(r));

    const outbox = store.bot_event_outbox as any[];
    const evt = outbox[outbox.length - 1];
    expect(evt.event_name).toBe('event_segment.transitioned');
    expect(evt.payload.data.segmentId).toBe(SEG_NEXT);
    expect(evt.payload.data.toStatus).toBe('live');
  });

  it('409 NO_NEXT_MATCH when there is no upcoming match after the current one', async () => {
    seedRun({ withNextMatch: false });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NO_NEXT_MATCH');
  });

  it('409 NO_LIVE_RUN when no run is live', async () => {
    store.event_runs = [] as any;
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NO_LIVE_RUN');
  });

  it('409 NO_CURRENT_SEGMENT when the live run has no live segment', async () => {
    seedRun();
    // Demote the live segment so no segment is live.
    (store.event_segments as any[]).find((s) => s.id === SEG_CUR).status =
      'done';
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NO_CURRENT_SEGMENT');
  });

  it('405 on non-POST', async () => {
    seedRun();
    const res = makeRes();
    await nextMatchHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
