// tests/unit/emailUnsubscribeEndpoint.test.ts
//
// Tests pour GET /api/email/unsubscribe (pages/api/email/unsubscribe.ts).
//   - token valide → 200 HTML + rows email enabled=false pour TOUS les
//     EMAIL_EVENT_TYPES du user.
//   - token invalide → 400 HTML, aucune mutation.
//   - mauvaise méthode → 405.
//
// supabase est auto-mocké par testSetup.ts. Le secret de signature est figé
// via env pour que generateUnsubscribeToken/verifyUnsubscribeToken concordent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  generateUnsubscribeToken,
  generateEmailUnsubscribeToken,
} from '@/utils/emailUnsubscribe';
import {
  EMAIL_EVENT_TYPES,
  BROADCAST_OPT_OUT_EVENT_TYPE,
} from '@/utils/webPushEvents';
import handler from '@/pages/api/email/unsubscribe';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function makeReq(over: Partial<any> = {}): any {
  return { method: 'GET', headers: { host: 'h' }, query: {}, ...over };
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

describe('GET /api/email/unsubscribe', () => {
  const prev = process.env.UNSUBSCRIBE_SECRET;

  beforeEach(() => {
    resetSupabaseMock();
    process.env.UNSUBSCRIBE_SECRET = 'fixed-endpoint-secret';
    store.notification_prefs = [];
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it('disables email for all EMAIL_EVENT_TYPES on a valid token (200 HTML)', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    const req = makeReq({ query: { token } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['Content-Type'])).toContain('text/html');
    expect(String(res.body)).toContain('Tu ne recevras plus');

    const rows = (store.notification_prefs ?? []).filter(
      (r) =>
        r.user_id === USER_ID && r.channel === 'email' && r.enabled === false
    );
    expect(rows.map((r) => r.event_type).sort()).toEqual(
      [...EMAIL_EVENT_TYPES].sort()
    );
  });

  it('is idempotent: a second call leaves exactly one row per event type', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    await handler(makeReq({ query: { token } }), makeRes());
    await handler(makeReq({ query: { token } }), makeRes());

    const rows = (store.notification_prefs ?? []).filter(
      (r) => r.user_id === USER_ID && r.channel === 'email'
    );
    expect(rows.length).toBe(EMAIL_EVENT_TYPES.length);
  });

  it('overrides an existing email opt-in row with enabled=false', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'news.published',
        channel: 'email',
        enabled: true,
      },
    ];
    const token = generateUnsubscribeToken(USER_ID);
    await handler(makeReq({ query: { token } }), makeRes());

    const news = (store.notification_prefs ?? []).filter(
      (r) =>
        r.user_id === USER_ID &&
        r.channel === 'email' &&
        r.event_type === 'news.published'
    );
    expect(news.length).toBe(1);
    expect(news[0].enabled).toBe(false);
  });

  it('returns 400 HTML on an invalid token and mutates nothing', async () => {
    const req = makeReq({ query: { token: 'garbage.token' } });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(String(res.headers['Content-Type'])).toContain('text/html');
    expect((store.notification_prefs ?? []).length).toBe(0);
  });

  it('returns 400 when no token is provided', async () => {
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405s on an unsupported method (PUT), advertising GET + POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET, POST');
  });
});

/* -----------------------------------------------------------
 * scope=broadcast — opt-out ciblé des annonces/campagnes
 * ---------------------------------------------------------*/

describe('GET /api/email/unsubscribe?scope=broadcast', () => {
  const prev = process.env.UNSUBSCRIBE_SECRET;

  beforeEach(() => {
    resetSupabaseMock();
    process.env.UNSUBSCRIBE_SECRET = 'fixed-endpoint-secret';
    store.notification_prefs = [];
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it('poses exactly ONE broadcast/email/false row and no others', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    const res = makeRes();
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), res);

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('annonces');

    const rows = (store.notification_prefs ?? []).filter(
      (r) => r.user_id === USER_ID && r.channel === 'email'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe(BROADCAST_OPT_OUT_EVENT_TYPE);
    expect(rows[0].enabled).toBe(false);
  });

  it('does NOT touch existing event-notification prefs', async () => {
    store.notification_prefs = [
      {
        user_id: USER_ID,
        event_type: 'match.starting',
        channel: 'email',
        enabled: true,
      },
    ];
    const token = generateUnsubscribeToken(USER_ID);
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), makeRes());

    // La row match.starting reste intacte (toujours enabled=true).
    const match = (store.notification_prefs ?? []).filter(
      (r) => r.event_type === 'match.starting'
    );
    expect(match).toHaveLength(1);
    expect(match[0].enabled).toBe(true);

    // Et la row broadcast a bien été posée.
    const broadcast = (store.notification_prefs ?? []).filter(
      (r) => r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE
    );
    expect(broadcast).toHaveLength(1);
    expect(broadcast[0].enabled).toBe(false);
  });

  it('is idempotent (one broadcast row after two calls)', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), makeRes());
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), makeRes());

    const rows = (store.notification_prefs ?? []).filter(
      (r) =>
        r.user_id === USER_ID &&
        r.channel === 'email' &&
        r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE
    );
    expect(rows).toHaveLength(1);
  });

  it('honors the broadcast scope over POST (one-click)', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', query: { token, scope: 'broadcast' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = (store.notification_prefs ?? []).filter(
      (r) => r.user_id === USER_ID && r.channel === 'email'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe(BROADCAST_OPT_OUT_EVENT_TYPE);
  });

  it('scope=notifications behaves like the global opt-out', async () => {
    const token = generateUnsubscribeToken(USER_ID);
    await handler(
      makeReq({ query: { token, scope: 'notifications' } }),
      makeRes()
    );

    const rows = (store.notification_prefs ?? []).filter(
      (r) => r.user_id === USER_ID && r.channel === 'email'
    );
    expect(rows.map((r) => r.event_type).sort()).toEqual(
      [...EMAIL_EVENT_TYPES].sort()
    );
  });
});

/* -----------------------------------------------------------
 * Token EMAIL — opt-out d'un destinataire sans compte auth
 * ---------------------------------------------------------*/

describe('GET /api/email/unsubscribe (email token)', () => {
  const prev = process.env.UNSUBSCRIBE_SECRET;

  beforeEach(() => {
    resetSupabaseMock();
    process.env.UNSUBSCRIBE_SECRET = 'fixed-endpoint-secret';
    store.notification_prefs = [];
    store.broadcast_email_optouts = [];
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.UNSUBSCRIBE_SECRET;
    else process.env.UNSUBSCRIBE_SECRET = prev;
  });

  it('upserts broadcast_email_optouts (200) and touches no notification_prefs', async () => {
    const token = generateEmailUnsubscribeToken('Adherent@Example.com');
    const res = makeRes();
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), res);

    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('annonces');

    const opts = store.broadcast_email_optouts ?? [];
    expect(opts).toHaveLength(1);
    // Stocké en minuscules, source = broadcast.
    expect(opts[0].email).toBe('adherent@example.com');
    expect(opts[0].source).toBe('broadcast');
    // Aucune écriture côté notification_prefs (pas de compte auth).
    expect((store.notification_prefs ?? []).length).toBe(0);
  });

  it('is idempotent: two clicks leave exactly one opt-out row', async () => {
    const token = generateEmailUnsubscribeToken('a@b.com');
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), makeRes());
    await handler(makeReq({ query: { token, scope: 'broadcast' } }), makeRes());

    expect(store.broadcast_email_optouts ?? []).toHaveLength(1);
  });

  it('works without the scope param (email token always = broadcast opt-out)', async () => {
    const token = generateEmailUnsubscribeToken('c@d.com');
    const res = makeRes();
    await handler(makeReq({ query: { token } }), res);

    expect(res.statusCode).toBe(200);
    expect((store.broadcast_email_optouts ?? []).map((r) => r.email)).toEqual([
      'c@d.com',
    ]);
  });
});
