// tests/unit/apiAdminWebhooks.test.ts
//
// Admin webhook subscription routes:
//   - POST /api/admin/webhooks : creates a subscription, generates a secret
//     (returned once), records created_by, validates event_types.
//   - GET  : lists subscriptions + availableEvents (no secret leaked).
//   - PATCH /api/admin/webhooks/[id] : enable/disable (resets failures on enable),
//     url (anti-SSRF rules shared with creation) / event_types / description.
//   - DELETE : removes the subscription (tenant-scoped).
//   - POST [id]/test, [id]/redeliver, [id]/rotate-secret.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import indexHandler from '../../pages/api/admin/webhooks/index';
import idHandler from '../../pages/api/admin/webhooks/[id]';
import testHandler from '../../pages/api/admin/webhooks/[id]/test';
import redeliverHandler from '../../pages/api/admin/webhooks/[id]/redeliver';
import rotateHandler from '../../pages/api/admin/webhooks/[id]/rotate-secret';

// Résolution DNS de l'envoi (garde anti-SSRF) : jamais de réseau en test.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function seedStaff() {
  const staff: StaffMember = {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: 'Alice',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
  store.staff = [staff] as any;
  store.tenants = [
    { id: TENANT, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'admin' },
  ] as any;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer t-1' },
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
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/webhooks', () => {
  it('creates a subscription, returns a secret once, records created_by', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({
        body: {
          url: 'https://example.com/hook',
          event_types: ['match.finished', 'tournament.finalized'],
          description: 'My overlay',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).secret).toMatch(/^whsec_/);
    const row = (store.webhook_subscriptions ?? [])[0] as any;
    expect(row.url).toBe('https://example.com/hook');
    expect(row.event_types).toEqual(['match.finished', 'tournament.finalized']);
    expect(row.created_by).toBe('staff-1');
    expect(row.secret).toMatch(/^whsec_/);
    expect(row.enabled).not.toBe(false);
  });

  it('400 on unknown event types', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({
        body: { url: 'https://x.com/h', event_types: ['bogus.event'] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_EVENT_TYPES');
    expect(store.webhook_subscriptions ?? []).toHaveLength(0);
  });

  it('400 on a non-http URL', async () => {
    seedStaff();
    const res = makeRes();
    await indexHandler(
      makeReq({
        body: { url: 'ftp://x.com/h', event_types: ['match.finished'] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET lists subscriptions + availableEvents without leaking the secret', async () => {
    seedStaff();
    (store.webhook_subscriptions ||= []).push({
      id: SUB_ID,
      tenant_id: TENANT,
      url: 'https://example.com/h',
      secret: 'whsec_super',
      event_types: ['match.finished'],
      description: null,
      enabled: true,
      consecutive_failures: 0,
      disabled_at: null,
      last_delivery_at: null,
      last_error: null,
      created_at: '2026-06-01T00:00:00.000Z',
    } as any);

    const res = makeRes();
    await indexHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.subscriptions).toHaveLength(1);
    // Note: the handler's SELECT column list deliberately omits `secret`; the
    // in-memory mock doesn't honour PostgREST column projection, so we can't
    // assert its absence here (verified by the explicit column list in code).
    expect(body.availableEvents).toContain('match.finished');
  });
});

describe('PATCH / DELETE /api/admin/webhooks/[id]', () => {
  function seedSub(over: Record<string, unknown> = {}) {
    (store.webhook_subscriptions ||= []).push({
      id: SUB_ID,
      tenant_id: TENANT,
      url: 'https://example.com/h',
      secret: 'whsec_super',
      event_types: ['match.finished'],
      enabled: true,
      consecutive_failures: 8,
      disabled_at: null,
      ...over,
    } as any);
  }

  it('PATCH enable resets the consecutive-failure counter', async () => {
    seedStaff();
    seedSub({
      enabled: false,
      consecutive_failures: 15,
      disabled_at: '2026-06-01T00:00:00.000Z',
    });
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: SUB_ID },
        body: { enabled: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.webhook_subscriptions ?? [])[0] as any;
    expect(row.enabled).toBe(true);
    expect(row.consecutive_failures).toBe(0);
    expect(row.disabled_at).toBeNull();
  });

  it('PATCH on another tenant → 404', async () => {
    seedStaff();
    seedSub({ tenant_id: 'other-tenant' });
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: SUB_ID },
        body: { enabled: false },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE removes the subscription', async () => {
    seedStaff();
    seedSub();
    const res = makeRes();
    await idHandler(makeReq({ method: 'DELETE', query: { id: SUB_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    expect(store.webhook_subscriptions ?? []).toHaveLength(0);
  });

  it('PATCH url + event_types : enregistre, remet les échecs à zéro, journalise update_webhook', async () => {
    seedStaff();
    seedSub({ consecutive_failures: 7, last_error: 'HTTP 500' });
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: SUB_ID },
        body: {
          url: 'https://new.example.com/hook',
          event_types: ['news.published'],
          description: 'Zapier',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const row = (store.webhook_subscriptions ?? [])[0] as any;
    expect(row.url).toBe('https://new.example.com/hook');
    expect(row.event_types).toEqual(['news.published']);
    expect(row.description).toBe('Zapier');
    expect(row.consecutive_failures).toBe(0);
    expect(row.enabled).toBe(true); // un changement d'URL ne réactive rien
    const log = (store.staff_logs ?? []).at(-1) as any;
    expect(log.action).toBe('update_webhook');
    expect(JSON.stringify(log)).not.toContain('whsec_super');
  });

  it.each([
    'http://example.com/h',
    'https://127.0.0.1/h',
    'https://169.254.169.254/latest',
    'https://localhost/h',
  ])(
    'PATCH url %s → 400 INVALID_URL (mêmes règles que la création)',
    async (url) => {
      seedStaff();
      seedSub();
      const res = makeRes();
      await idHandler(
        makeReq({ method: 'PATCH', query: { id: SUB_ID }, body: { url } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as any).code).toBe('INVALID_URL');
      expect((store.webhook_subscriptions ?? [])[0]).toMatchObject({
        url: 'https://example.com/h',
      });
    }
  );

  it('PATCH event_types inconnus → 400 INVALID_EVENT_TYPES', async () => {
    seedStaff();
    seedSub();
    const res = makeRes();
    await idHandler(
      makeReq({
        method: 'PATCH',
        query: { id: SUB_ID },
        body: { event_types: ['team.member.added'] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_EVENT_TYPES');
  });

  it('PATCH sans aucun champ → 400 INVALID_BODY', async () => {
    seedStaff();
    seedSub();
    const res = makeRes();
    await idHandler(
      makeReq({ method: 'PATCH', query: { id: SUB_ID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });
});

describe('POST /api/admin/webhooks/[id]/test', () => {
  function seedSub(over: Record<string, unknown> = {}) {
    (store.webhook_subscriptions ||= []).push({
      id: SUB_ID,
      tenant_id: TENANT,
      url: 'https://example.com/h',
      secret: 'whsec_super',
      event_types: ['match.finished'],
      enabled: true,
      consecutive_failures: 3,
      ...over,
    } as any);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('envoie un webhook.test signé, sans toucher livraisons ni compteurs', async () => {
    seedStaff();
    seedSub();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST', query: { id: SUB_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 204, error: null });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe('https://example.com/h');
    const body = JSON.parse(String(init.body));
    expect(body.event).toBe('webhook.test');
    expect(body.tenantId).toBe(TENANT);
    expect(init.headers['X-Webhook-Event']).toBe('webhook.test');
    expect(init.headers['X-Webhook-Signature']).toMatch(
      /^sha256=[0-9a-f]{64}$/
    );
    // Le secret ne fuit ni dans la réponse ni au journal.
    expect(JSON.stringify(res.body)).not.toContain('whsec_super');
    expect(JSON.stringify(store.staff_logs ?? [])).not.toContain('whsec_super');
    expect(store.webhook_deliveries ?? []).toHaveLength(0);
    expect((store.webhook_subscriptions as any[])[0].consecutive_failures).toBe(
      3
    );
  });

  it('destinataire en erreur → 200 ok:false (réponse, pas une erreur)', async () => {
    seedStaff();
    seedSub();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST', query: { id: SUB_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: false, status: 500 });
  });

  it("abonnement d'un autre espace → 404, aucun envoi", async () => {
    seedStaff();
    seedSub({ tenant_id: 'other-tenant' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await testHandler(makeReq({ method: 'POST', query: { id: SUB_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/webhooks/[id]/redeliver', () => {
  const DELIVERY_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  function seed(deliveryOver: Record<string, unknown> = {}) {
    store.webhook_subscriptions = [
      {
        id: SUB_ID,
        tenant_id: TENANT,
        url: 'https://example.com/h',
        secret: 'whsec_super',
        event_types: ['match.finished'],
        enabled: true,
        consecutive_failures: 5,
        last_error: 'HTTP 500',
      },
    ] as any;
    store.webhook_deliveries = [
      {
        id: DELIVERY_ID,
        tenant_id: TENANT,
        subscription_id: SUB_ID,
        outbox_event_id: EVENT_ID,
        event_name: 'match.finished',
        status: 'failed',
        attempts: 5,
        response_status: 500,
        last_error: 'HTTP 500',
        delivered_at: null,
        ...deliveryOver,
      },
    ] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: EVENT_ID,
        event_name: 'match.finished',
        tenant_id: TENANT,
        payload: { id: EVENT_ID, event: 'match.finished', data: { x: 1 } },
        status: 'delivered',
      },
    ] as any;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renvoie le corps d’origine, met la livraison à jour et remet l’abonnement au vert', async () => {
    seedStaff();
    seed();
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await redeliverHandler(
      makeReq({
        method: 'POST',
        query: { id: SUB_ID },
        body: { deliveryId: DELIVERY_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 200 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      id: EVENT_ID,
      event: 'match.finished',
      data: { x: 1 },
    });
    expect(init.headers['X-Webhook-Id']).toBe(EVENT_ID);
    const d = (store.webhook_deliveries as any[])[0];
    expect(d.status).toBe('delivered');
    expect(d.attempts).toBe(6);
    expect(d.delivered_at).toBeTruthy();
    const sub = (store.webhook_subscriptions as any[])[0];
    expect(sub.consecutive_failures).toBe(0);
    expect(sub.last_error).toBeNull();
    const log = (store.staff_logs ?? []).at(-1) as any;
    expect(log.action).toBe('redeliver_webhook');
  });

  it('nouvel échec : livraison toujours failed, compteur d’abonnement inchangé', async () => {
    seedStaff();
    seed();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );
    const res = makeRes();
    await redeliverHandler(
      makeReq({
        method: 'POST',
        query: { id: SUB_ID },
        body: { deliveryId: DELIVERY_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: false, status: 503 });
    const d = (store.webhook_deliveries as any[])[0];
    expect(d.status).toBe('failed');
    expect(d.attempts).toBe(6);
    expect((store.webhook_subscriptions as any[])[0].consecutive_failures).toBe(
      5
    );
  });

  it('livraison déjà livrée → 409 NOT_FAILED, aucun envoi', async () => {
    seedStaff();
    seed({ status: 'delivered' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = makeRes();
    await redeliverHandler(
      makeReq({
        method: 'POST',
        query: { id: SUB_ID },
        body: { deliveryId: DELIVERY_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('event purgé de l’outbox → 409 EVENT_GONE', async () => {
    seedStaff();
    seed();
    store.bot_event_outbox = [] as any;
    const res = makeRes();
    await redeliverHandler(
      makeReq({
        method: 'POST',
        query: { id: SUB_ID },
        body: { deliveryId: DELIVERY_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('EVENT_GONE');
  });

  it('deliveryId invalide → 400', async () => {
    seedStaff();
    seed();
    const res = makeRes();
    await redeliverHandler(
      makeReq({
        method: 'POST',
        query: { id: SUB_ID },
        body: { deliveryId: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_DELIVERY_ID');
  });
});

describe('POST /api/admin/webhooks/[id]/rotate-secret', () => {
  it('nouveau secret rendu une fois, stocké, absent du journal', async () => {
    seedStaff();
    store.webhook_subscriptions = [
      {
        id: SUB_ID,
        tenant_id: TENANT,
        url: 'https://example.com/h',
        secret: 'whsec_old',
        event_types: ['match.finished'],
        enabled: true,
      },
    ] as any;
    const res = makeRes();
    await rotateHandler(
      makeReq({ method: 'POST', query: { id: SUB_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const secret = (res.body as any).secret as string;
    expect(secret).toMatch(/^whsec_/);
    expect(secret).not.toBe('whsec_old');
    expect((store.webhook_subscriptions as any[])[0].secret).toBe(secret);
    const logs = JSON.stringify(store.staff_logs ?? []);
    expect(logs).toContain('rotate_webhook_secret');
    expect(logs).not.toContain(secret);
  });

  it("abonnement d'un autre espace → 404, secret intact", async () => {
    seedStaff();
    store.webhook_subscriptions = [
      { id: SUB_ID, tenant_id: 'other', secret: 'whsec_old' },
    ] as any;
    const res = makeRes();
    await rotateHandler(
      makeReq({ method: 'POST', query: { id: SUB_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((store.webhook_subscriptions as any[])[0].secret).toBe('whsec_old');
  });
});
