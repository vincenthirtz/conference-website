// tests/unit/streamAlertTest.test.ts
//
// POST /api/admin/stream-alert-test — l'alerte de test passe par la même table
// que les vrais événements Twitch, marquée `test-…`, pour l'espace du staff.

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
import handler from '../../pages/api/admin/stream-alert-test';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

function staffRow(role: 'admin' | 'caster'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'staff@x.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function req(body: unknown, method = 'POST'): any {
  n += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer tok-${Date.now()}-${n}` },
    query: {},
    body,
    cookies: {},
  };
}

function res() {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  r.getHeader = (k: string) => r.headers[k];
  return r;
}

type EventRow = {
  tenant_id: string;
  twitch_message_id: string;
  kind: string;
  actor_name: string | null;
  amount: number | null;
  tier: string | null;
};

const events = () => (store.stream_alert_events ?? []) as unknown as EventRow[];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
});

describe('POST /api/admin/stream-alert-test', () => {
  it('dépose une alerte marquée test- pour l’espace du staff', async () => {
    const r = res();
    await handler(req({ kind: 'raid' }), r);
    expect(r.statusCode).toBe(200);
    expect(events()).toHaveLength(1);
    const row = events()[0]!;
    expect(row.tenant_id).toBe(TENANT);
    expect(row.twitch_message_id).toMatch(/^test-/);
    expect(row.kind).toBe('raid');
    expect(row.actor_name).toBe('Test');
    expect(row.amount).toBe(42);
  });

  it('garde le pseudo fourni, et un palier pour les subs', async () => {
    const r = res();
    await handler(req({ kind: 'sub', name: 'Mercy' }), r);
    expect(r.statusCode).toBe(200);
    expect(events()[0]).toMatchObject({ actor_name: 'Mercy', tier: '1000' });
  });

  it('refuse un type hors table (les dons viennent de HelloAsso)', async () => {
    const r = res();
    await handler(req({ kind: 'donation' }), r);
    expect(r.statusCode).toBe(400);
    expect(events()).toHaveLength(0);
  });

  it('405 hors POST', async () => {
    const r = res();
    await handler(req(undefined, 'GET'), r);
    expect(r.statusCode).toBe(405);
    expect(r.headers.Allow).toBe('POST');
  });

  it('réservé à manage_broadcast : une casteuse est refusée', async () => {
    store.staff = [staffRow('caster')] as any;
    invalidateStaffCache();
    const r = res();
    await handler(req({ kind: 'follow' }), r);
    expect(r.statusCode).toBe(403);
    expect(events()).toHaveLength(0);
  });
});
