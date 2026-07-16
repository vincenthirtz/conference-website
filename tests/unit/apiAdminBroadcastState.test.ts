import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({
    delivered: true,
    status: 200,
    attempts: 1,
  })),
}));

import { emitBotEvent } from '@/utils/botEvents';
import broadcastHandler from '../../pages/api/admin/broadcast/state';

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

const RUN_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  (emitBotEvent as any).mockClear();
});

describe('GET /api/admin/broadcast/state', () => {
  it('returns empty/default state when no live run', async () => {
    const res = makeRes();
    await broadcastHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.run).toBeNull();
    expect(body.state.on_air).toBe(false);
    expect(body.state.lower_third).toBeNull();
    expect(body.state.pip.enabled).toBe(false);
  });

  it('returns run + segment + default state when run is live', async () => {
    store.event_runs = [
      {
        id: RUN_ID,
        name: 'Finale',
        slug: 'finale-2026',
        status: 'live',
        started_at: '2026-05-25T18:00:00Z',
        scheduled_at: '2026-05-25T18:00:00Z',
        broadcast_state: {
          v: 1,
          on_air: false,
          lower_third: null,
          pip: { enabled: false },
        },
      },
    ] as any;
    const res = makeRes();
    await broadcastHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.run.id).toBe(RUN_ID);
    expect(body.run.status).toBe('live');
    expect(body.state.on_air).toBe(false);
  });

  it('caster role can read but not edit (403 on POST)', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    store.event_runs = [
      {
        id: RUN_ID,
        name: 'Finale',
        slug: 'finale-2026',
        status: 'live',
        broadcast_state: {
          v: 1,
          on_air: false,
          lower_third: null,
          pip: { enabled: false },
        },
      },
    ] as any;
    const getRes = makeRes();
    await broadcastHandler(makeReq(), getRes);
    expect(getRes.statusCode).toBe(200);

    const postRes = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { on_air: true } }),
      postRes
    );
    expect(postRes.statusCode).toBe(403);
  });
});

describe('POST /api/admin/broadcast/state', () => {
  it('400 when no fields provided', async () => {
    store.event_runs = [
      {
        id: RUN_ID,
        slug: 'r',
        status: 'live',
        broadcast_state: {
          v: 1,
          on_air: false,
          lower_third: null,
          pip: { enabled: false },
        },
      },
    ] as any;
    const res = makeRes();
    await broadcastHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when on_air is not boolean', async () => {
    const res = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { on_air: 'yes' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when lower_third too long', async () => {
    const res = makeRes();
    await broadcastHandler(
      makeReq({
        method: 'POST',
        body: { lower_third: 'a'.repeat(501) },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('409 NO_LIVE_RUN when no run is live', async () => {
    const res = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { on_air: true } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NO_LIVE_RUN');
  });

  it('200 patch on_air merges state + emits outbox event + logs', async () => {
    store.event_runs = [
      {
        id: RUN_ID,
        name: 'Finale',
        slug: 'finale-2026',
        status: 'live',
        broadcast_state: {
          v: 1,
          on_air: false,
          lower_third: null,
          pip: { enabled: false },
        },
      },
    ] as any;
    const res = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { on_air: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.state.on_air).toBe(true);
    expect(body.state.lower_third).toBeNull();

    // DB row updated
    const run = (store.event_runs as any[]).find((r) => r.id === RUN_ID);
    expect(run.broadcast_state.on_air).toBe(true);

    // Bot event emitted
    expect((emitBotEvent as any).mock.calls).toHaveLength(1);
    const [eventName, payload, tenantId] = (emitBotEvent as any).mock.calls[0];
    expect(eventName).toBe('broadcast.state_changed');
    expect(payload.runId).toBe(RUN_ID);
    expect(payload.state.on_air).toBe(true);
    expect(typeof tenantId).toBe('string');

    // Staff log
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'broadcast_state_update'
    );
    expect(log).toBeDefined();
  });

  it('200 patch lower_third null clears the field', async () => {
    store.event_runs = [
      {
        id: RUN_ID,
        slug: 'r',
        status: 'live',
        broadcast_state: {
          v: 1,
          on_air: true,
          lower_third: 'hi',
          pip: { enabled: true },
        },
      },
    ] as any;
    const res = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { lower_third: null } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).state.lower_third).toBeNull();
    // Autres champs preserves
    expect((res.body as any).state.on_air).toBe(true);
    expect((res.body as any).state.pip.enabled).toBe(true);
  });

  it('200 patch pip.enabled', async () => {
    store.event_runs = [
      {
        id: RUN_ID,
        slug: 'r',
        status: 'live',
        broadcast_state: {
          v: 1,
          on_air: false,
          lower_third: null,
          pip: { enabled: false },
        },
      },
    ] as any;
    const res = makeRes();
    await broadcastHandler(
      makeReq({ method: 'POST', body: { pip: { enabled: true } } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).state.pip.enabled).toBe(true);
  });
});
