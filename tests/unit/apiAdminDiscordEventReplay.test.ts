// tests/unit/apiAdminDiscordEventReplay.test.ts
//
// POST /api/admin/discord-logs/replay — rejeu d'une ligne `failed` de
// bot_event_outbox :
//   - failed → pending, compteurs remis à zéro, last_push_at rafraîchi ;
//   - claim distribué du bot (discord_event_ack) libéré, sinon le poller
//     acquitterait l'event sans le dispatcher ;
//   - journalisé (`replay_bot_event`) ;
//   - idempotent (déjà pending → 200 replayed:false, rien d'écrit) ;
//   - 409 sur un event livré, 404 hors espace, 400 sur un id invalide.
// Relecture par le bot : GET /api/bot/v1/events/pending ne filtre que sur
// `status = 'pending'` (pas de fenêtre de temps) — la ligne remise en file y
// figure donc au prochain tick du poller.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import replayHandler from '../../pages/api/admin/discord-logs/replay';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';
const EVENT_ID = '7b0c6f0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';

function staffRow(role: 'admin' | 'caster' = 'admin'): StaffMember {
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

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-replay-${n}` },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seedOutbox(over: Record<string, unknown> = {}) {
  store.bot_event_outbox = [
    {
      id: 42,
      event_id: EVENT_ID,
      event_name: 'match.finished',
      tenant_id: TENANT,
      payload: { id: EVENT_ID, event: 'match.finished', data: {} },
      status: 'failed',
      push_attempts: 3,
      last_push_error: 'auto-failed: pending > 6h',
      last_push_at: '2026-01-01T06:00:00.000Z',
      delivered_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      ...over,
    },
  ] as any;
  store.discord_event_ack = [
    { event_id: EVENT_ID, handled_at: '2026-01-01T00:00:01.000Z' },
    { event_id: 'other-event', handled_at: '2026-01-01T00:00:01.000Z' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('POST /api/admin/discord-logs/replay', () => {
  it('failed → pending : compteurs remis à zéro, claim libéré, journalisé', async () => {
    seedOutbox();
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 'event:42' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 42, status: 'pending', replayed: true });
    const row = (store.bot_event_outbox as any[])[0];
    expect(row.status).toBe('pending');
    expect(row.push_attempts).toBe(0);
    expect(row.last_push_error).toBeNull();
    expect(row.delivered_at).toBeNull();
    expect(new Date(row.last_push_at).getTime()).toBeGreaterThan(
      Date.parse('2026-02-01')
    );
    // Seul le claim de CET event est libéré.
    expect((store.discord_event_ack as any[]).map((a) => a.event_id)).toEqual([
      'other-event',
    ]);
    const log = (store.staff_logs ?? []).at(-1) as any;
    expect(log.action).toBe('replay_bot_event');
    expect(log.entity_id).toBe(EVENT_ID);
  });

  it('accepte un id numérique', async () => {
    seedOutbox();
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).replayed).toBe(true);
  });

  it('idempotent : déjà pending → 200 replayed:false, rien écrit ni journalisé', async () => {
    seedOutbox({ status: 'pending', push_attempts: 1 });
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 42, status: 'pending', replayed: false });
    expect((store.bot_event_outbox as any[])[0].push_attempts).toBe(1);
    expect(store.discord_event_ack).toHaveLength(2);
    expect(
      (store.staff_logs ?? []).filter(
        (l: any) => l.action === 'replay_bot_event'
      )
    ).toHaveLength(0);
  });

  it('rejouer deux fois : le second appel ne refait rien', async () => {
    seedOutbox();
    await replayHandler(makeReq({ body: { id: 42 } }), makeRes());
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect((res.body as any).replayed).toBe(false);
  });

  it('event livré → 409 ALREADY_DELIVERED', async () => {
    seedOutbox({ status: 'delivered' });
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_DELIVERED');
    expect(store.discord_event_ack).toHaveLength(2);
  });

  it("event d'un autre espace → 404, intact", async () => {
    seedOutbox({ tenant_id: OTHER_TENANT });
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect(res.statusCode).toBe(404);
    expect((store.bot_event_outbox as any[])[0].status).toBe('failed');
  });

  it.each([[{}], [{ id: 'abc' }], [{ id: -1 }], [{ id: 'event:' }]])(
    'id invalide %j → 400 INVALID_ID',
    async (body) => {
      seedOutbox();
      const res = makeRes();
      await replayHandler(makeReq({ body }), res);
      expect(res.statusCode).toBe(400);
      expect((res.body as any).code).toBe('INVALID_ID');
    }
  );

  it('405 sur GET', async () => {
    const res = makeRes();
    await replayHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('caster (sans manage_settings) → 403', async () => {
    store.staff = [staffRow('caster')] as any;
    seedOutbox();
    const res = makeRes();
    await replayHandler(makeReq({ body: { id: 42 } }), res);
    expect(res.statusCode).toBe(403);
    expect((store.bot_event_outbox as any[])[0].status).toBe('failed');
  });
});
