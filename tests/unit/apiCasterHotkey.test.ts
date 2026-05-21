// Test for /api/caster/segments/[segId]/hotkey.
//
// Verifies :
//   - 202 + outbox row inserted when caster is properly assigned (match segment).
//   - 403 when caster is not assigned to the match.
//   - 404 when segment is in a different tenant.
//   - 400 on invalid payload / invalid segId.
//   - For non-match segments (intro/outro/break), no assignment check needed.

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

import hotkeyHandler from '../../pages/api/caster/segments/[segId]/hotkey';

const TENANT_X = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_Y = '00000000-0000-4000-8000-00000000000a';

const SEG_X_MATCH = '22222222-2222-4222-8222-222222222aaa';
const SEG_X_INTRO = '22222222-2222-4222-8222-222222222bbb';
const SEG_Y = '22222222-2222-4222-8222-222222222ccc';
const RUN_X = '33333333-3333-4333-8333-333333333333';
const MATCH_X = '44444444-4444-4444-8444-444444444444';
const MATCH_OTHER = '44444444-4444-4444-8444-444444444555';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
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
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: { kind: 'highlight' },
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
      id: 'cast-1',
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

  store.event_segments = [
    {
      id: SEG_X_MATCH,
      tenant_id: TENANT_X,
      event_run_id: RUN_X,
      type: 'match',
      match_id: MATCH_X,
      title: 'Final game 1',
    },
    {
      id: SEG_X_INTRO,
      tenant_id: TENANT_X,
      event_run_id: RUN_X,
      type: 'intro',
      match_id: null,
      title: 'Opening',
    },
    {
      id: SEG_Y,
      tenant_id: TENANT_Y,
      event_run_id: 'run-y',
      type: 'match',
      match_id: MATCH_X,
      title: 'Other tenant',
    },
  ] as any;

  store.cast_assignments = [
    {
      id: 'assign-1',
      tenant_id: TENANT_X,
      cast_member_id: 'cast-1',
      match_id: MATCH_X,
      role: 'caster',
    },
  ] as any;

  store.bot_event_outbox = [] as any;
});

describe('POST /api/caster/segments/[segId]/hotkey', () => {
  it('returns 202 and writes to bot_event_outbox for a match segment with assignment', async () => {
    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({
        query: { segId: SEG_X_MATCH },
        body: { kind: 'highlight', payload: { source: 'mobile' } },
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    const body = res.body as { ok: boolean; eventId: string; kind: string };
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('highlight');

    expect(store.bot_event_outbox).toHaveLength(1);
    const ev = store.bot_event_outbox[0] as any;
    expect(ev.event_name).toBe('cast.hotkey_triggered');
    expect(ev.tenant_id).toBe(TENANT_X);
    expect(ev.status).toBe('pending');
    expect(ev.payload.data.kind).toBe('highlight');
    expect(ev.payload.data.segmentId).toBe(SEG_X_MATCH);
    expect(ev.payload.data.caster.id).toBe('cast-1');
  });

  it('returns 202 for an intro segment without checking cast_assignments', async () => {
    // Drop assignments to ensure the endpoint does NOT block on this.
    store.cast_assignments = [] as any;

    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({
        query: { segId: SEG_X_INTRO },
        body: { kind: 'pause' },
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    expect(store.bot_event_outbox).toHaveLength(1);
  });

  it('returns 403 when caster is not assigned to the match segment', async () => {
    // Caster assigned to OTHER match, not to MATCH_X.
    store.cast_assignments = [
      {
        id: 'assign-2',
        tenant_id: TENANT_X,
        cast_member_id: 'cast-1',
        match_id: MATCH_OTHER,
        role: 'caster',
      },
    ] as any;

    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({
        query: { segId: SEG_X_MATCH },
        body: { kind: 'highlight' },
      }),
      res
    );

    expect(res.statusCode).toBe(403);
    const body = res.body as { code?: string };
    expect(body.code).toBe('NOT_ASSIGNED');
    expect(store.bot_event_outbox).toHaveLength(0);
  });

  it('returns 404 when the segment belongs to a different tenant', async () => {
    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({
        query: { segId: SEG_Y },
        body: { kind: 'highlight' },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(store.bot_event_outbox).toHaveLength(0);
  });

  it('returns 400 when payload is invalid', async () => {
    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({
        query: { segId: SEG_X_MATCH },
        body: { kind: 'unknown-kind' },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(store.bot_event_outbox).toHaveLength(0);
  });

  it('returns 400 on invalid segId', async () => {
    const res = makeRes();
    await hotkeyHandler(makeAuthedReq({ query: { segId: 'not-a-uuid' } }), res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on GET', async () => {
    const res = makeRes();
    await hotkeyHandler(
      makeAuthedReq({ method: 'GET', query: { segId: SEG_X_MATCH } }),
      res
    );

    expect(res.statusCode).toBe(405);
  });
});
