import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// broadcasts.ts importe @/utils/email au chargement — on le stub pour éviter de
// tirer le SDK Brevo dans les tests unitaires (même idiome que broadcastWaves).
vi.mock('@/utils/email', () => ({
  sendIdahobitLiveEmail: vi.fn(async () => ({ success: true })),
  buildIdahobitLiveEmailHtml: vi.fn(() => '<html></html>'),
  buildCampaignEmailHtml: vi.fn(() => '<html></html>'),
  sendCampaignEmail: vi.fn(async () => ({ success: true })),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import { computeSubscriptionStats } from '../../utils/broadcasts';
import subscriptionsHandler from '../../pages/api/admin/broadcast/subscriptions';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  setAuthListUsers([]);
});

/* -----------------------------------------------------------
 * computeSubscriptionStats
 * ---------------------------------------------------------*/

describe('computeSubscriptionStats', () => {
  it('counts subscribed/unsubscribed, excludes unconfirmed, ignores non-broadcast opt-outs, sorts + resolves labels', async () => {
    setAuthListUsers([
      // confirmé, battle_tag → désabonné broadcast (2026-05-10) → label "Alpha"
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Ignored' },
      } as any,
      // confirmé, display_name, aucun opt-out → abonné
      {
        id: 'u2',
        email: 'b@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Bee' },
      } as any,
      // confirmé, opt-out d'un EMAIL_EVENT_TYPE (match.starting) → PAS un
      // désabonnement broadcast → reste abonné
      {
        id: 'u3',
        email: 'c@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Cee' },
      } as any,
      // confirmé, ni battle_tag ni display_name → désabonné (2026-05-20), label null
      {
        id: 'u4',
        email: 'd@x.com',
        confirmed_at: '2026-01-02',
        user_metadata: {},
      } as any,
      // NON confirmé mais opt-out broadcast → ignoré des compteurs
      {
        id: 'u5',
        email: 'e@x.com',
        user_metadata: {},
      } as any,
      // confirmé, opt-out broadcast RÉACTIVÉ (enabled=true) → abonné
      {
        id: 'u6',
        email: 'f@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Eff' },
      } as any,
      // confirmé, opt-out broadcast sur canal push (pas email) → abonné
      {
        id: 'u7',
        email: 'g@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Gee' },
      } as any,
      // confirmé, désabonné broadcast avec updated_at null → trié en dernier
      {
        id: 'u8',
        email: 'h@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Zed' },
      } as any,
    ]);

    store.profiles = [{ id: 'u1', battle_tag: 'Alpha#1234' }] as any;

    store.notification_prefs = [
      {
        user_id: 'u1',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
        updated_at: '2026-05-10T00:00:00.000Z',
      },
      {
        user_id: 'u3',
        event_type: 'match.starting',
        channel: 'email',
        enabled: false,
        updated_at: '2026-05-15T00:00:00.000Z',
      },
      {
        user_id: 'u4',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
        updated_at: '2026-05-20T00:00:00.000Z',
      },
      {
        user_id: 'u5',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
        updated_at: '2026-05-25T00:00:00.000Z',
      },
      {
        user_id: 'u6',
        event_type: 'broadcast',
        channel: 'email',
        enabled: true,
        updated_at: '2026-05-11T00:00:00.000Z',
      },
      {
        user_id: 'u7',
        event_type: 'broadcast',
        channel: 'push',
        enabled: false,
        updated_at: '2026-05-12T00:00:00.000Z',
      },
      {
        user_id: 'u8',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
        updated_at: null,
      },
    ] as any;

    const stats = await computeSubscriptionStats();

    // confirmés : u1,u2,u3,u4,u6,u7,u8 = 7 ; u5 non confirmé ignoré
    expect(stats.totalConfirmed).toBe(7);
    // désabonnés broadcast confirmés : u1, u4, u8
    expect(stats.unsubscribed).toBe(3);
    // abonnés : u2, u3, u6, u7
    expect(stats.subscribed).toBe(4);
    expect(stats.totalConfirmed).toBe(stats.subscribed + stats.unsubscribed);

    // Tri par date décroissante ; null en dernier.
    expect(stats.unsubscribedUsers).toEqual([
      {
        email: 'd@x.com',
        label: null,
        unsubscribedAt: '2026-05-20T00:00:00.000Z',
      },
      {
        email: 'a@x.com',
        label: 'Alpha',
        unsubscribedAt: '2026-05-10T00:00:00.000Z',
      },
      { email: 'h@x.com', label: 'Zed', unsubscribedAt: null },
    ]);
  });

  it('returns all-subscribed when there are no broadcast opt-outs', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: {},
      } as any,
      {
        id: 'u2',
        email: 'b@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: {},
      } as any,
    ]);

    const stats = await computeSubscriptionStats();
    expect(stats).toEqual({
      totalConfirmed: 2,
      subscribed: 2,
      unsubscribed: 0,
      unsubscribedUsers: [],
    });
  });
});

/* -----------------------------------------------------------
 * GET /api/admin/broadcast/subscriptions
 * ---------------------------------------------------------*/

describe('broadcast subscriptions endpoint', () => {
  it('returns the subscription stats shape', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'a@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Alpha' },
      } as any,
      {
        id: 'u2',
        email: 'b@x.com',
        email_confirmed_at: '2026-01-01',
        user_metadata: { display_name: 'Bee' },
      } as any,
    ]);
    store.notification_prefs = [
      {
        user_id: 'u2',
        event_type: 'broadcast',
        channel: 'email',
        enabled: false,
        updated_at: '2026-05-20T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await subscriptionsHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toEqual({
      totalConfirmed: 2,
      subscribed: 1,
      unsubscribed: 1,
      unsubscribedUsers: [
        {
          email: 'b@x.com',
          label: 'Bee',
          unsubscribedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    });
  });

  it('rejects non-GET methods with 405 + Allow header', async () => {
    const res = makeRes();
    await subscriptionsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('returns 403 when role is below admin', async () => {
    store.staff = [makeStaffRow('manager')] as any;
    const res = makeRes();
    await subscriptionsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });
});
