import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

vi.mock('@/utils/castEvents', () => ({
  emitCastEvent: vi.fn(async () => undefined),
}));

import { emitCastEvent } from '@/utils/castEvents';
import scrimCastHandler from '../../pages/api/admin/scrims/[scrimId]/cast-assignments';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'manager',
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
    method: 'GET',
    headers: { host: 'h', authorization: freshBearer() },
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

const SCRIM_ID = '11111111-1111-1111-1111-111111111111';
const CAST_MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const FUTURE = new Date(Date.now() + 60 * 60_000).toISOString();

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  (emitCastEvent as any).mockClear();
});

describe('POST /api/admin/scrims/[scrimId]/cast-assignments', () => {
  it('400 invalid scrimId', async () => {
    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: 'bogus' },
        body: { castMemberId: CAST_MEMBER_ID, briefingAt: FUTURE },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 invalid castMemberId', async () => {
    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { castMemberId: 'no', briefingAt: FUTURE },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 briefingAt in past', async () => {
    const past = new Date(Date.now() - 30 * 60_000).toISOString();
    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { castMemberId: CAST_MEMBER_ID, briefingAt: past },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when cast_member not found', async () => {
    store.scrims = [{ id: SCRIM_ID, name: 'Test scrim' }] as any;
    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { castMemberId: CAST_MEMBER_ID, briefingAt: FUTURE },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('404 when scrim not found', async () => {
    store.cast_members = [
      { id: CAST_MEMBER_ID, is_active: true },
    ] as any;
    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { castMemberId: CAST_MEMBER_ID, briefingAt: FUTURE },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('201 inserts cast_assignment with scrim_id (NOT match_id) + emits event', async () => {
    store.scrims = [{ id: SCRIM_ID, name: 'Test scrim' }] as any;
    store.cast_members = [
      { id: CAST_MEMBER_ID, is_active: true },
    ] as any;

    const res = makeRes();
    await scrimCastHandler(
      makeReq({
        method: 'POST',
        query: { scrimId: SCRIM_ID },
        body: { castMemberId: CAST_MEMBER_ID, briefingAt: FUTURE },
      }),
      res
    );
    expect(res.statusCode).toBe(201);

    // Polymorphic row : scrim_id set, match_id null
    const rows = (store.cast_assignments as any[]) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].scrim_id).toBe(SCRIM_ID);
    expect(rows[0].match_id).toBeNull();

    // emitCastEvent fired with scrimId
    expect((emitCastEvent as any).mock.calls).toHaveLength(1);
    const [eventName, payload, tenantId] = (emitCastEvent as any).mock.calls[0];
    expect(eventName).toBe('cast.assigned');
    expect(payload.scrimId).toBe(SCRIM_ID);
    expect(typeof tenantId).toBe('string');
  });

  it('GET returns assignments scoped to the scrim', async () => {
    store.cast_assignments = [
      {
        id: 'a1',
        scrim_id: SCRIM_ID,
        match_id: null,
        cast_member_id: CAST_MEMBER_ID,
        briefing_at: FUTURE,
        acked_at: null,
        created_at: '2026-05-25T00:00:00Z',
      },
      // Should be ignored — different scrim
      {
        id: 'a2',
        scrim_id: '33333333-3333-3333-3333-333333333333',
        match_id: null,
      },
    ] as any;
    const res = makeRes();
    await scrimCastHandler(
      makeReq({ query: { scrimId: SCRIM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].id).toBe('a1');
  });
});
