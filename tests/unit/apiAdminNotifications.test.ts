// tests/unit/apiAdminNotifications.test.ts
//
// Tests pour les 4 routes Web Push de la PWA /admin :
//   - POST   /api/admin/notifications/subscribe
//   - DELETE /api/admin/notifications/unsubscribe
//   - GET    /api/admin/notifications/prefs
//   - PUT    /api/admin/notifications/prefs
//   - POST   /api/admin/notifications/test
//
// La lib `web-push` est entièrement mockée pour éviter tout I/O réseau et
// pour pouvoir simuler 410 Gone (subscription expirée) et erreurs génériques.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_PUSH_EVENT_TYPES } from '../../utils/webPushEvents';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

// Mock web-push BEFORE importing the route handlers.
const { sendNotification } = vi.hoisted(() => ({
  sendNotification: vi.fn(
    async (
      _sub: { endpoint: string; keys: { p256dh: string; auth: string } },
      _payload?: string | Buffer | null,
      _options?: unknown
    ): Promise<{ statusCode: number }> => ({ statusCode: 201 })
  ),
}));

vi.mock('web-push', () => ({
  default: {
    sendNotification,
  },
}));

import subscribeHandler from '../../pages/api/admin/notifications/subscribe';
import unsubscribeHandler from '../../pages/api/admin/notifications/unsubscribe';
import prefsHandler from '../../pages/api/admin/notifications/prefs';
import testHandler from '../../pages/api/admin/notifications/test';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: USER_ID,
    email: 'a@a.com',
    role: 'caster',
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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
    ended: false,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER_ID });
  store.staff = [makeStaffRow()] as any;
  store.tenants = [
    {
      id: TENANT_A,
      slug: 'alpha',
      name: 'Alpha',
      is_active: true,
      default_locale: 'fr',
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'caster' },
  ] as any;
  store.push_subscriptions = [] as any;
  store.notification_prefs = [] as any;
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * POST /subscribe
 * ===========================================================================*/

describe('POST /api/admin/notifications/subscribe', () => {
  const validBody = {
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'pk-key', auth: 'auth-key' },
    },
    user_agent: 'Mozilla/5.0 (Test)',
  };

  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await subscribeHandler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(401);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await subscribeHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });

  it('400 si endpoint manquant', async () => {
    const res = makeRes();
    await subscribeHandler(
      makeReq({
        method: 'POST',
        body: { subscription: { keys: { p256dh: 'pk', auth: 'a' } } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });

  it('400 si endpoint non-URL', async () => {
    const res = makeRes();
    await subscribeHandler(
      makeReq({
        method: 'POST',
        body: {
          subscription: {
            endpoint: 'not-a-url',
            keys: { p256dh: 'pk', auth: 'a' },
          },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 created sur première subscription', async () => {
    const res = makeRes();
    await subscribeHandler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(201);
    expect((res.body as any).created).toBe(true);
    expect((res.body as any).endpoint).toBe(validBody.subscription.endpoint);

    // Et la row a bien été insérée pour ce user.
    expect(store.push_subscriptions).toHaveLength(1);
    expect((store.push_subscriptions[0] as any).user_id).toBe(USER_ID);
    expect((store.push_subscriptions[0] as any).endpoint).toBe(
      validBody.subscription.endpoint
    );
  });

  it('200 updated sur conflict endpoint (même user)', async () => {
    // Pré-existant pour le même user.
    store.push_subscriptions = [
      {
        id: 'sub-existing',
        user_id: USER_ID,
        endpoint: validBody.subscription.endpoint,
        p256dh: 'old-pk',
        auth: 'old-auth',
        user_agent: 'OldUA',
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await subscribeHandler(
      makeReq({
        method: 'POST',
        body: {
          ...validBody,
          subscription: {
            ...validBody.subscription,
            keys: { p256dh: 'new-pk', auth: 'new-auth' },
          },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).created).toBe(false);

    // La row a été mise à jour (clés refresh).
    expect(store.push_subscriptions).toHaveLength(1);
    expect((store.push_subscriptions[0] as any).p256dh).toBe('new-pk');
    expect((store.push_subscriptions[0] as any).auth).toBe('new-auth');
  });

  it('200 updated re-assign user_id quand un autre user reprend le device', async () => {
    // Endpoint déjà associé à un autre user.
    store.push_subscriptions = [
      {
        id: 'sub-other',
        user_id: OTHER_USER_ID,
        endpoint: validBody.subscription.endpoint,
        p256dh: 'old',
        auth: 'old',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await subscribeHandler(makeReq({ method: 'POST', body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).created).toBe(false);
    // user_id a été réassigné au user courant.
    expect((store.push_subscriptions[0] as any).user_id).toBe(USER_ID);
  });
});

/* ===========================================================================
 * DELETE /unsubscribe
 * ===========================================================================*/

describe('DELETE /api/admin/notifications/unsubscribe', () => {
  beforeEach(() => {
    store.push_subscriptions = [
      {
        id: 'sub-1',
        user_id: USER_ID,
        endpoint: 'https://push.example/1',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-2',
        user_id: OTHER_USER_ID,
        endpoint: 'https://push.example/other',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;
  });

  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await unsubscribeHandler(
      makeReq({
        method: 'DELETE',
        body: { endpoint: 'https://push.example/1' },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('405 sur POST', async () => {
    const res = makeRes();
    await unsubscribeHandler(
      makeReq({
        method: 'POST',
        body: { endpoint: 'https://push.example/1' },
      }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('DELETE');
  });

  it('400 si endpoint manquant', async () => {
    const res = makeRes();
    await unsubscribeHandler(makeReq({ method: 'DELETE', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('204 sur delete own subscription', async () => {
    const res = makeRes();
    await unsubscribeHandler(
      makeReq({
        method: 'DELETE',
        body: { endpoint: 'https://push.example/1' },
      }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    // sub-1 retirée, sub-2 (autre user) préservée.
    expect(store.push_subscriptions).toHaveLength(1);
    expect((store.push_subscriptions[0] as any).id).toBe('sub-2');
  });

  it('404 si la subscription appartient à un autre user', async () => {
    const res = makeRes();
    await unsubscribeHandler(
      makeReq({
        method: 'DELETE',
        body: { endpoint: 'https://push.example/other' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    // La row de l'autre user est toujours là (pas touchée).
    expect(store.push_subscriptions).toHaveLength(2);
  });

  it('404 si endpoint inconnu', async () => {
    const res = makeRes();
    await unsubscribeHandler(
      makeReq({
        method: 'DELETE',
        body: { endpoint: 'https://push.example/nonexistent' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

/* ===========================================================================
 * GET /prefs
 * ===========================================================================*/

describe('GET /api/admin/notifications/prefs', () => {
  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await prefsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('retourne tous les event_types avec enabled=true par défaut', async () => {
    const res = makeRes();
    await prefsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const prefs = (res.body as any).prefs;
    expect(prefs).toBeInstanceOf(Array);
    // Ancré sur la liste canonique plutôt que sur un compte figé : ajouter un
    // event_type ne doit pas casser ce test (il vérifie le défaut opt-out, pas
    // la taille du catalogue).
    expect(prefs).toHaveLength(WEB_PUSH_EVENT_TYPES.length);
    expect(prefs.every((p: any) => p.enabled === true)).toBe(true);

    const types = prefs.map((p: any) => p.event_type);
    expect(types).toContain('match.starting');
    expect(types).toContain('cast.assigned');
    expect(types).toContain('helloasso.payment.received');
    expect(types).toContain('event_segment.transitioned');
  });

  it('fusionne les opt-out stockés avec les défauts', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'news.published',
        enabled: false,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      // Une row enabled=false pour un AUTRE user → ignorée.
      {
        user_id: OTHER_USER_ID,
        event_type: 'match.starting',
        enabled: false,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await prefsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const prefs = (res.body as any).prefs as Array<{
      event_type: string;
      enabled: boolean;
    }>;

    const findPref = (t: string) => prefs.find((p) => p.event_type === t);
    expect(findPref('news.published')?.enabled).toBe(false);
    // Pas touché par la row de l'autre user.
    expect(findPref('match.starting')?.enabled).toBe(true);
    // Tous les autres restent true.
    expect(findPref('cast.assigned')?.enabled).toBe(true);
  });
});

/* ===========================================================================
 * PUT /prefs
 * ===========================================================================*/

describe('PUT /api/admin/notifications/prefs', () => {
  it('400 si event_type inconnu (zod enum reject)', async () => {
    const res = makeRes();
    await prefsHandler(
      makeReq({
        method: 'PUT',
        body: {
          prefs: [{ event_type: 'fake.unknown.event', enabled: false }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    // Rien d'écrit en DB.
    expect(store.notification_prefs).toHaveLength(0);
  });

  it('400 si enabled non-booléen', async () => {
    const res = makeRes();
    await prefsHandler(
      makeReq({
        method: 'PUT',
        body: {
          prefs: [{ event_type: 'match.starting', enabled: 'yes' as any }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it("upsert des opt-out (enabled=false) et retour de l'état complet", async () => {
    const res = makeRes();
    await prefsHandler(
      makeReq({
        method: 'PUT',
        body: {
          prefs: [
            { event_type: 'news.published', enabled: false },
            { event_type: 'match.starting', enabled: false },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);

    // 2 rows opt-out stockées.
    expect(store.notification_prefs).toHaveLength(2);
    const stored = (store.notification_prefs as any[]).map((r) => r.event_type);
    expect(stored).toContain('news.published');
    expect(stored).toContain('match.starting');

    // Réponse exhaustive.
    const prefs = (res.body as any).prefs as Array<{
      event_type: string;
      enabled: boolean;
    }>;
    expect(prefs).toHaveLength(WEB_PUSH_EVENT_TYPES.length);
    expect(prefs.find((p) => p.event_type === 'news.published')?.enabled).toBe(
      false
    );
    expect(prefs.find((p) => p.event_type === 'match.starting')?.enabled).toBe(
      false
    );
    expect(prefs.find((p) => p.event_type === 'cast.assigned')?.enabled).toBe(
      true
    );
  });

  it('enabled=true delete la row si elle existait', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'news.published',
        enabled: false,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await prefsHandler(
      makeReq({
        method: 'PUT',
        body: {
          prefs: [{ event_type: 'news.published', enabled: true }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // La row a été supprimée (optimisation storage : default = enabled).
    expect(store.notification_prefs).toHaveLength(0);

    const prefs = (res.body as any).prefs as Array<{
      event_type: string;
      enabled: boolean;
    }>;
    expect(prefs.find((p) => p.event_type === 'news.published')?.enabled).toBe(
      true
    );
  });

  it('405 sur DELETE', async () => {
    const res = makeRes();
    await prefsHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* ===========================================================================
 * POST /test
 * ===========================================================================*/

describe('POST /api/admin/notifications/test', () => {
  beforeEach(() => {
    // VAPID env vars (set BEFORE handler runs).
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-pub';
    process.env.VAPID_PRIVATE_KEY = 'test-priv';
  });

  it('401 sans auth', async () => {
    setAuthUser(null);
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('500 si VAPID non configuré', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(500);
    expect((res.body as any).code).toBe('VAPID_NOT_CONFIGURED');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sent=0 si aucune subscription', async () => {
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sent: 0, expired_removed: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('envoie sur toutes les subscriptions du user courant', async () => {
    store.push_subscriptions = [
      {
        id: 'sub-1',
        user_id: USER_ID,
        endpoint: 'https://push.example/1',
        p256dh: 'pk1',
        auth: 'a1',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-2',
        user_id: USER_ID,
        endpoint: 'https://push.example/2',
        p256dh: 'pk2',
        auth: 'a2',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
      // Subscription d'un autre user → ne doit PAS recevoir.
      {
        id: 'sub-other',
        user_id: OTHER_USER_ID,
        endpoint: 'https://push.example/other',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).sent).toBe(2);
    expect((res.body as any).failed).toBe(0);
    expect((res.body as any).expired_removed).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(2);

    // Vérifie qu'on a bien passé endpoint + keys au push service.
    const call0 = sendNotification.mock.calls[0][0];
    expect(call0.endpoint).toMatch(/^https:\/\/push\.example\/[12]$/);
    expect(call0.keys.p256dh).toBeDefined();
    expect(call0.keys.auth).toBeDefined();
  });

  it('purge les subscriptions expirées (410 Gone)', async () => {
    store.push_subscriptions = [
      {
        id: 'sub-ok',
        user_id: USER_ID,
        endpoint: 'https://push.example/ok',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-expired',
        user_id: USER_ID,
        endpoint: 'https://push.example/expired',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    sendNotification.mockImplementation(async (sub: any) => {
      if (sub.endpoint.endsWith('/expired')) {
        const err = Object.assign(new Error('Gone'), { statusCode: 410 });
        throw err;
      }
      return { statusCode: 201 };
    });

    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).sent).toBe(1);
    expect((res.body as any).failed).toBe(0);
    expect((res.body as any).expired_removed).toBe(1);

    // La row sub-expired a été purgée.
    expect(store.push_subscriptions).toHaveLength(1);
    expect((store.push_subscriptions[0] as any).id).toBe('sub-ok');
  });

  it('compte les erreurs non-expiration comme failed sans purger', async () => {
    store.push_subscriptions = [
      {
        id: 'sub-flaky',
        user_id: USER_ID,
        endpoint: 'https://push.example/flaky',
        p256dh: 'pk',
        auth: 'a',
        user_agent: null,
        last_seen_at: '2026-01-01T00:00:00.000Z',
      },
    ] as any;

    sendNotification.mockImplementation(async () => {
      const err = Object.assign(new Error('Boom'), { statusCode: 500 });
      throw err;
    });

    const res = makeRes();
    await testHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).sent).toBe(0);
    expect((res.body as any).failed).toBe(1);
    expect((res.body as any).expired_removed).toBe(0);
    // La row reste en DB.
    expect(store.push_subscriptions).toHaveLength(1);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await testHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
  });
});
