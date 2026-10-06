// tests/unit/adminNotificationsBadge.test.ts
//
// Badge Web Push du staff, route migrée sur `defineAdminRoute`
// (features/admin/notifications) :
//   - POST /api/admin/notifications/ack-all      → { count_cleared }
// (GET /unread-count, appelée par personne — ni l'admin, ni le SW, ni le
// bot —, a été supprimée.)
// Les autres routes du module sont couvertes par apiAdminNotifications.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import ackAllHandler from '../../pages/api/admin/notifications/ack-all';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-badge-${n}` },
    query: {},
    cookies: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
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

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'caster',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function seedDeliveries() {
  store.push_subscriptions = [
    { id: 'sub-mine', user_id: 'user-1', endpoint: 'https://p/1' },
    { id: 'sub-other', user_id: 'user-2', endpoint: 'https://p/2' },
  ] as any;
  store.web_push_deliveries = [
    {
      id: 'd1',
      subscription_id: 'sub-mine',
      status: 'delivered',
      acked_at: null,
    },
    {
      id: 'd2',
      subscription_id: 'sub-mine',
      status: 'delivered',
      acked_at: null,
    },
    {
      id: 'd3',
      subscription_id: 'sub-mine',
      status: 'delivered',
      acked_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'd4',
      subscription_id: 'sub-other',
      status: 'delivered',
      acked_at: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/notifications/ack-all', () => {
  it("acks the caller's unacked deliveries only", async () => {
    seedDeliveries();
    const res = makeRes();
    await ackAllHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ count_cleared: 2 });
    const other = (store.web_push_deliveries as any[]).find(
      (d) => d.id === 'd4'
    );
    expect(other.acked_at).toBeNull();
  });

  it('401 without a session', async () => {
    setAuthUser(null);
    const res = makeRes();
    await ackAllHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });
});
