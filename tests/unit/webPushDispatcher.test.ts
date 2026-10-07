// tests/unit/webPushDispatcher.test.ts
//
// Tests pour le dispatcher Web Push (Netlify scheduled function +
// /api/cron/web-push-dispatch).
//
// La lib `web-push` est entièrement mockée pour pouvoir simuler :
//   - succès (HTTP 201)
//   - 410 Gone (subscription expirée → purge + delivery=expired)
//   - 500 (failed récupérable → attempts++, status=failed)
//
// Le mock supabase est partagé (cf. tests/unit/__helpers__/supabaseMock.ts) :
// on seed `staff`, `tenant_staff`, `bot_event_outbox`, `push_subscriptions`,
// `notification_prefs`, `web_push_deliveries` directement et on assert sur
// l'état post-tick.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'cron-test-secret';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-pub';
  process.env.VAPID_PRIVATE_KEY = 'test-priv';
});

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
  default: { sendNotification },
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler, {
  runWebPushDispatcher,
  __resetWebPushSettledMemoForTests,
} from '../../pages/api/cron/web-push-dispatch';
import { playerUrlForEvent } from '../../utils/webPushEvents';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_A = 'auth-user-a';
const USER_B = 'auth-user-b';
const USER_POLE = 'auth-user-pole';
const STAFF_A = 'staff-a';
const STAFF_B = 'staff-b';
const STAFF_POLE = 'staff-pole';
const SUB_A = 'sub-a';
const SUB_B = 'sub-b';
const SUB_POLE = 'sub-pole';

const NOW = '2026-05-21T10:00:00.000Z';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: 'Bearer cron-test-secret' },
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

function seedBaseFixtures() {
  store.staff = [
    {
      id: STAFF_A,
      auth_user_id: USER_A,
      role: 'caster',
      is_active: true,
      deleted_at: null,
      is_pole_admin: false,
    },
    {
      id: STAFF_B,
      auth_user_id: USER_B,
      role: 'caster',
      is_active: true,
      deleted_at: null,
      is_pole_admin: false,
    },
    {
      id: STAFF_POLE,
      auth_user_id: USER_POLE,
      role: 'admin',
      is_active: true,
      deleted_at: null,
      is_pole_admin: true,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_A, role: 'caster' },
    { tenant_id: TENANT_B, staff_id: STAFF_B, role: 'caster' },
  ] as any;
  store.push_subscriptions = [
    {
      id: SUB_A,
      user_id: USER_A,
      endpoint: 'https://push.example/a',
      p256dh: 'pk-a',
      auth: 'auth-a',
      user_agent: null,
      last_seen_at: NOW,
    },
    {
      id: SUB_B,
      user_id: USER_B,
      endpoint: 'https://push.example/b',
      p256dh: 'pk-b',
      auth: 'auth-b',
      user_agent: null,
      last_seen_at: NOW,
    },
    {
      id: SUB_POLE,
      user_id: USER_POLE,
      endpoint: 'https://push.example/pole',
      p256dh: 'pk-pole',
      auth: 'auth-pole',
      user_agent: null,
      last_seen_at: NOW,
    },
  ] as any;
  store.notification_prefs = [];
  store.web_push_deliveries = [];
  store.bot_event_outbox = [];
}

beforeEach(() => {
  // Freeze le clock à NOW : le dispatcher filtre les events par fenêtre
  // glissante (24h par défaut) via `gte('created_at', cutoff)`. Sans freeze,
  // la suite casse dès que le calendrier dépasse NOW + 24h.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  resetSupabaseMock();
  seedBaseFixtures();
  // Mémo des events réglés (en mémoire du process) : les tests réutilisent les
  // mêmes event_id, un test ne doit pas hériter de l'issue du précédent.
  __resetWebPushSettledMemoForTests();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

/* ===========================================================================
 * Auth + method gating (handler-level)
 * ===========================================================================*/

describe('handler auth + method', () => {
  it('405 sur PATCH', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 sans Authorization', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('401 avec mauvais Bearer', async () => {
    const res = makeRes();
    await handler(
      makeReq({ headers: { host: 'h', authorization: 'Bearer wrong' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('200 avec ?secret=… en query', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'GET',
        headers: { host: 'h' },
        query: { secret: 'cron-test-secret' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('500 si VAPID non configuré', async () => {
    const saved = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(500);
    expect((res.body as any).code).toBe('VAPID_NOT_CONFIGURED');
    process.env.VAPID_PRIVATE_KEY = saved;
  });
});

/* ===========================================================================
 * Happy path : event → fan-out
 * ===========================================================================*/

describe('happy path dispatch', () => {
  it('envoie un push à chaque subscription du tenant et écrit une delivery=delivered', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-1',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: { match_id: 'm-1', teamA_name: 'Alpha', teamB_name: 'Beta' },
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();

    // 1 sub pour USER_A (TENANT_A) + 1 sub pour USER_POLE (pole admin
    // cross-tenant) = 2 envois.
    expect(counters.events_examined).toBe(1);
    expect(counters.processed).toBe(1);
    expect(counters.sent).toBe(2);
    expect(counters.failed).toBe(0);
    expect(counters.expired_removed).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(2);

    // USER_B (TENANT_B) ne doit PAS recevoir.
    const callTargets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    expect(callTargets).toContain('https://push.example/a');
    expect(callTargets).toContain('https://push.example/pole');
    expect(callTargets).not.toContain('https://push.example/b');

    // Payload format : title, body, data.url, tag.
    const firstPayload = JSON.parse(
      sendNotification.mock.calls[0][1] as string
    );
    expect(firstPayload.title).toBe('Match imminent');
    expect(firstPayload.body).toContain('Alpha vs Beta');
    expect(firstPayload.data.url).toBe('/admin/matches/m-1');
    expect(firstPayload.tag).toBe('evt-1');

    // 2 rows web_push_deliveries en status=delivered.
    expect(store.web_push_deliveries).toHaveLength(2);
    for (const row of store.web_push_deliveries as any[]) {
      expect(row.status).toBe('delivered');
      expect(row.outbox_event_id).toBe('evt-1');
      expect(row.attempts).toBe(1);
      expect(typeof row.delivered_at).toBe('string');
    }
  });

  it('un user avec plusieurs devices reçoit sur chaque device', async () => {
    store.push_subscriptions = [
      ...(store.push_subscriptions as any[]),
      {
        id: 'sub-a2',
        user_id: USER_A,
        endpoint: 'https://push.example/a2',
        p256dh: 'pk-a2',
        auth: 'auth-a2',
        user_agent: null,
        last_seen_at: NOW,
      },
    ] as any;
    store.bot_event_outbox = [
      {
        id: 2,
        event_id: 'evt-multi',
        event_name: 'news.published',
        tenant_id: TENANT_A,
        payload: { title: 'Hello world', slug: 'hello-world' },
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    // USER_A (2 devices) + USER_POLE (1 device) = 3 envois.
    expect(counters.sent).toBe(3);
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });
});

/* ===========================================================================
 * Filtering
 * ===========================================================================*/

describe('filtering', () => {
  it("ignore les events dont l'event_name n'est pas dans WEB_PUSH_EVENT_TYPES", async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-unknown',
        event_name: 'team.created', // pas dans WEB_PUSH_EVENT_TYPES
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    expect(counters.events_examined).toBe(0);
    expect(counters.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skip un user qui a opt-out pour cet event_type', async () => {
    store.notification_prefs = [
      {
        user_id: USER_A,
        event_type: 'cast.assigned',
        channel: 'push',
        enabled: false,
        updated_at: NOW,
      },
    ] as any;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-cast',
        event_name: 'cast.assigned',
        tenant_id: TENANT_A,
        payload: { caster_name: 'Vincent', match_id: 'm-2' },
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    // USER_A opt-out, donc seul USER_POLE reçoit (pole admin).
    expect(counters.sent).toBe(1);
    expect(counters.skipped_prefs).toBe(1);
    const targets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    expect(targets).toEqual(['https://push.example/pole']);
  });

  it('un staff is_active=false ne reçoit pas', async () => {
    (store.staff as any[]).find((s) => s.id === STAFF_A).is_active = false;
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-x',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    // Seul le pole admin reçoit.
    expect(counters.sent).toBe(1);
  });

  it('ne re-envoie pas un event déjà delivered (idempotence)', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-dup',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;
    store.web_push_deliveries = [
      {
        id: 'wd-1',
        outbox_event_id: 'evt-dup',
        subscription_id: SUB_A,
        status: 'delivered',
        attempts: 1,
        delivered_at: NOW,
        last_error: null,
        updated_at: NOW,
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    // SUB_A skipped (déjà delivered), SUB_POLE envoyé.
    expect(counters.sent).toBe(1);
    expect(counters.skipped_already_delivered).toBe(1);
    const targets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    expect(targets).toEqual(['https://push.example/pole']);
  });

  it("n'envoie rien si l'event n'a pas de tenant_id", async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-orphan',
        event_name: 'match.starting',
        tenant_id: null,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    expect(counters.events_examined).toBe(1);
    expect(counters.processed).toBe(0);
    expect(counters.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

/* ===========================================================================
 * Erreurs HTTP
 * ===========================================================================*/

describe('erreurs HTTP du push service', () => {
  it('410 Gone → supprime la subscription + delivery=expired', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-gone',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    sendNotification.mockImplementation(async (sub: any) => {
      if (sub.endpoint.endsWith('/a')) {
        const err = Object.assign(new Error('Gone'), {
          statusCode: 410,
          body: 'subscription expired',
        });
        throw err;
      }
      return { statusCode: 201 };
    });

    const counters = await runWebPushDispatcher();
    expect(counters.sent).toBe(1); // pole admin OK
    expect(counters.expired_removed).toBe(1);
    expect(counters.failed).toBe(0);

    // La sub SUB_A est purgée, SUB_POLE reste.
    const subIds = (store.push_subscriptions as any[]).map((s) => s.id);
    expect(subIds).not.toContain(SUB_A);
    expect(subIds).toContain(SUB_POLE);

    // delivery=expired conservée pour audit.
    const expiredRow = (store.web_push_deliveries as any[]).find(
      (d) => d.subscription_id === SUB_A
    );
    expect(expiredRow.status).toBe('expired');
    expect(expiredRow.last_error).toContain('subscription expired');
  });

  it('404 Not Found → même traitement que 410 (subscription morte)', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-404',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    sendNotification.mockImplementation(async (sub: any) => {
      if (sub.endpoint.endsWith('/a')) {
        const err = Object.assign(new Error('Not Found'), { statusCode: 404 });
        throw err;
      }
      return { statusCode: 201 };
    });

    const counters = await runWebPushDispatcher();
    expect(counters.expired_removed).toBe(1);
    expect(
      (store.push_subscriptions as any[]).some((s) => s.id === SUB_A)
    ).toBe(false);
  });

  it('500 transient → delivery=failed avec attempts=1', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-500',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    sendNotification.mockImplementation(async (sub: any) => {
      if (sub.endpoint.endsWith('/a')) {
        const err = Object.assign(new Error('Boom'), {
          statusCode: 500,
          body: 'upstream 500',
        });
        throw err;
      }
      return { statusCode: 201 };
    });

    const counters = await runWebPushDispatcher();
    expect(counters.sent).toBe(1); // pole admin OK
    expect(counters.failed).toBe(1);
    expect(counters.expired_removed).toBe(0);

    // SUB_A toujours là (pas supprimée).
    expect(
      (store.push_subscriptions as any[]).some((s) => s.id === SUB_A)
    ).toBe(true);

    const failedRow = (store.web_push_deliveries as any[]).find(
      (d) => d.subscription_id === SUB_A
    );
    expect(failedRow.status).toBe('failed');
    expect(failedRow.attempts).toBe(1);
    expect(failedRow.last_error).toContain('upstream 500');
  });

  it("transient → attempts s'incrémente sur ticks successifs", async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-retry',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;
    sendNotification.mockImplementation(async () => {
      const err = Object.assign(new Error('Boom'), { statusCode: 500 });
      throw err;
    });

    // 3 ticks consécutifs.
    await runWebPushDispatcher();
    await runWebPushDispatcher();
    await runWebPushDispatcher();

    // Pour chaque sub (SUB_A + SUB_POLE), attempts doit valoir 3.
    for (const d of store.web_push_deliveries as any[]) {
      expect(d.status).toBe('failed');
      expect(d.attempts).toBe(3);
    }
  });

  it('skip définitivement une delivery passée à MAX_ATTEMPTS_BEFORE_GIVING_UP', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-max',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;
    // 5 attempts déjà consommés → on doit skip sans appeler webpush.
    store.web_push_deliveries = [
      {
        id: 'wd-x',
        outbox_event_id: 'evt-max',
        subscription_id: SUB_A,
        status: 'failed',
        attempts: 5,
        last_error: 'boom',
        updated_at: NOW,
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    expect(counters.sent).toBe(1); // pole admin
    expect(counters.skipped_max_attempts).toBe(1);
    // SUB_A non re-tenté.
    const callTargets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    expect(callTargets).not.toContain('https://push.example/a');
  });
});

/* ===========================================================================
 * In-flight lock
 * ===========================================================================*/

describe('in-flight lock', () => {
  it('skip un tick si le précédent est encore en cours', async () => {
    // Une seule subscription pour ne lancer qu'un seul `sendNotification`
    // et garder le contrôle de sa résolution.
    store.push_subscriptions = [
      {
        id: SUB_A,
        user_id: USER_A,
        endpoint: 'https://push.example/a',
        p256dh: 'pk-a',
        auth: 'auth-a',
        user_agent: null,
        last_seen_at: NOW,
      },
    ] as any;
    // Pas de pole admin → un seul recipient pour cet event.
    (store.staff as any[]).forEach((s) => {
      s.is_pole_admin = false;
    });
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-lock',
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    // Le premier tick reste bloqué sur sendNotification jusqu'à ce qu'on
    // résolve manuellement.
    let resolveFirst: (() => void) | null = null;
    let markFirstStarted: (() => void) | null = null;
    const firstStarted = new Promise<void>((r) => {
      markFirstStarted = r;
    });
    sendNotification.mockImplementation(
      () =>
        new Promise<{ statusCode: number }>((resolve) => {
          resolveFirst = () => resolve({ statusCode: 201 });
          markFirstStarted?.();
        })
    );

    const firstRes = makeRes();
    const firstTickPromise = handler(makeReq(), firstRes);

    // Attend que le premier handler ait commencé un push (lock posé).
    await firstStarted;

    // Second tick (avant que le premier se termine) → skipped.
    const secondRes = makeRes();
    await handler(makeReq(), secondRes);
    expect(secondRes.statusCode).toBe(200);
    expect((secondRes.body as any).skipped).toBe('in_flight');

    // Termine le premier.
    (resolveFirst as (() => void) | null)?.();
    await firstTickPromise;
    expect(firstRes.statusCode).toBe(200);
    expect((firstRes.body as any).success).toBe(true);
  });
});

/* ===========================================================================
 * tcg.pack_granted — audience RÉDUITE à la gagnante
 * ===========================================================================
 *
 * CE QUE CE BLOC PROTÈGE. Le dispatcher a une branche par défaut : tout le
 * staff du tenant, plus les pole admins (cross-tenant). Un paquet gagné y
 * tomberait sans deux exceptions explicites — `staffUserIds = []` et un fanout
 * player réduit au seul `payload.userId`. Le résultat serait des dizaines de
 * notifications par soirée de tournoi, envoyées à des gens que ça ne concerne
 * pas : le meilleur moyen de faire couper les notifications à tout le monde.
 *
 * Ces exceptions tiennent en deux lignes, donc elles sont faciles à retirer par
 * inadvertance. C'est ce test, et lui seul, qui s'y oppose.
 */
describe('tcg.pack_granted', () => {
  // La gagnante n'est PAS staff : si elle l'était, la perspective staff
  // primerait et ce test passerait au vert sans rien prouver du fanout player.
  const USER_WINNER = 'auth-user-winner';
  const SUB_WINNER = 'sub-winner';

  function seedWinnerSubscription() {
    (store.push_subscriptions as any[]).push({
      id: SUB_WINNER,
      user_id: USER_WINNER,
      endpoint: 'https://push.example/winner',
      p256dh: 'pk-w',
      auth: 'auth-w',
      user_agent: null,
      last_seen_at: NOW,
    });
  }

  function makePackEvent(data: Record<string, unknown> = {}) {
    return {
      id: 120,
      event_id: 'evt-tcg-1',
      event_name: 'tcg.pack_granted',
      tenant_id: TENANT_A,
      payload: {
        id: 'evt-tcg-1',
        event: 'tcg.pack_granted',
        tenantId: TENANT_A,
        timestamp: NOW,
        data: {
          userId: USER_WINNER,
          discordUserId: null,
          discordUsername: null,
          matchId: 'match-1',
          isScrim: false,
          coins: 100,
          ctaUrl: 'https://owwomenscup.fr/player/tcg',
          ...data,
        },
      },
      created_at: NOW,
      status: 'pending',
    };
  }

  it('notifie la gagnante, et PERSONNE d’autre', async () => {
    seedWinnerSubscription();
    store.bot_event_outbox = [makePackEvent()] as any;

    const counters = await runWebPushDispatcher();

    expect(counters.sent).toBe(1);
    const targets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    // Un seul destinataire. Le staff du tenant (a, b) et le pole admin, tous
    // abonnés, ne doivent RIEN recevoir.
    expect(targets).toEqual(['https://push.example/winner']);
  });

  it('pointe vers l’écran où le paquet s’ouvre, et annonce le gain', async () => {
    seedWinnerSubscription();
    store.bot_event_outbox = [makePackEvent()] as any;

    await runWebPushDispatcher();

    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    // `/player/tcg` et non `/player` : la notification tient en un geste, elle
    // ne doit pas obliger à chercher la tuile.
    expect(payload.data.url).toBe('/player/tcg');
    expect(payload.body).toContain('100');
  });

  it('n’annonce pas de montant quand il est absent', async () => {
    // « et 0 pièces » serait une information FAUSSE, pas une information
    // manquante.
    seedWinnerSubscription();
    store.bot_event_outbox = [makePackEvent({ coins: 0 })] as any;

    await runWebPushDispatcher();

    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.body).not.toContain('0 pièces');
    expect(payload.body).toContain('paquet');
  });

  it('n’envoie rien si le payload ne désigne aucune joueuse', async () => {
    // Défense en profondeur : sans `userId`, on ne sait pas à qui s'adresser.
    // Retomber sur le staff serait exactement le déluge qu'on évite.
    seedWinnerSubscription();
    store.bot_event_outbox = [makePackEvent({ userId: null })] as any;

    const counters = await runWebPushDispatcher();

    expect(counters.sent).toBe(0);
    expect(sendNotification.mock.calls).toHaveLength(0);
  });
});

/* ===========================================================================
 * Cross-tenant : pole admin reçoit les events de plusieurs tenants
 * ===========================================================================*/

describe('cross-tenant pole admin', () => {
  it('pole admin reçoit un event tenant B même sans row tenant_staff', async () => {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: 'evt-tenantB',
        event_name: 'match.starting',
        tenant_id: TENANT_B,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;

    const counters = await runWebPushDispatcher();
    // USER_B (tenant_staff TENANT_B) + USER_POLE (pole admin).
    expect(counters.sent).toBe(2);
    const targets = sendNotification.mock.calls.map(
      (c: any[]) => c[0].endpoint
    );
    expect(targets).toContain('https://push.example/b');
    expect(targets).toContain('https://push.example/pole');
    expect(targets).not.toContain('https://push.example/a');
  });
});

/* ---------------------------------------------------------------------------
 * URL joueuse des events de match — lot J1 (docs/PLAN-espace-joueur.md).
 *
 * Avant l'existence du fil du match, TOUT event de match renvoyait `/player` :
 * la notification « ton check-in est ouvert » ouvrait un tableau de bord où il
 * fallait ensuite retrouver le match. Elle ouvre désormais le match lui-même —
 * et retombe sur `/player` seulement quand le payload ne porte pas d'id, ce qui
 * arrive avec les emitters historiques.
 * ------------------------------------------------------------------------- */

describe('playerUrlForEvent — events de match', () => {
  const MATCH_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('ouvre le fil du match quand le payload porte un id (forme envelope)', () => {
    expect(
      playerUrlForEvent('checkin.opened', { data: { match_id: MATCH_ID } })
    ).toBe(`/player/match/${MATCH_ID}`);
  });

  it('accepte aussi la forme plate et la casse camelCase', () => {
    expect(playerUrlForEvent('match.starting', { matchId: MATCH_ID })).toBe(
      `/player/match/${MATCH_ID}`
    );
  });

  it('retombe sur /player sans identifiant de match', () => {
    expect(playerUrlForEvent('match.finished', {})).toBe('/player');
  });

  it('ne touche pas aux autres familles d’events', () => {
    expect(playerUrlForEvent('scrim.search.matched', {})).toBe('/player/teams');
    expect(playerUrlForEvent('team.weekly.recap', {})).toBe('/player');
  });
});

/* ===========================================================================
 * Mémo des events réglés — le rebalayage de la fenêtre ne recalcule plus
 * l'audience d'un event qui n'a plus rien à retenter.
 * ===========================================================================*/

describe('mémo des events réglés', () => {
  function seedEvent(eventId: string) {
    store.bot_event_outbox = [
      {
        id: 1,
        event_id: eventId,
        event_name: 'match.starting',
        tenant_id: TENANT_A,
        payload: {},
        created_at: NOW,
        status: 'pending',
      },
    ] as any;
  }

  async function countFromCalls(table: string, run: () => Promise<unknown>) {
    const { supabaseAdmin } = await import('./__helpers__/supabaseMock');
    const spy = vi.spyOn(supabaseAdmin as any, 'from');
    await run();
    const n = spy.mock.calls.filter((c) => c[0] === table).length;
    spy.mockRestore();
    return n;
  }

  it('un event entièrement livré ne recalcule plus son audience au tick suivant', async () => {
    seedEvent('evt-settled');
    await runWebPushDispatcher();
    expect(sendNotification).toHaveBeenCalledTimes(2);

    const staffReads = await countFromCalls('tenant_staff', () =>
      runWebPushDispatcher()
    );
    expect(staffReads).toBe(0);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('un event en échec transitoire reste retenté à chaque tick', async () => {
    seedEvent('evt-still-failing');
    sendNotification.mockImplementation(async () => {
      throw Object.assign(new Error('Boom'), { statusCode: 500 });
    });
    await runWebPushDispatcher();
    await runWebPushDispatcher();
    for (const d of store.web_push_deliveries as any[]) {
      expect(d.attempts).toBe(2);
    }
  });

  it('le mémo expire : passé 15 min, l’event est réexaminé', async () => {
    seedEvent('evt-memo-expiry');
    await runWebPushDispatcher();
    vi.setSystemTime(new Date(Date.parse(NOW) + 15 * 60_000 + 1));
    const staffReads = await countFromCalls('tenant_staff', () =>
      runWebPushDispatcher()
    );
    expect(staffReads).toBeGreaterThan(0);
    // Toujours livré une seule fois : web_push_deliveries fait foi.
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });
});
