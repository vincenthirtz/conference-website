// Webhook entrant Twitch EventSub — la boîte d'alertes.
// Target: pages/api/webhooks/twitch/alerts.ts
//
// CE QUE CES TESTS PROTÈGENT EN PRIORITÉ : la signature. C'est une URL PUBLIQUE
// qui met du texte à l'antenne ; si le HMAC cesse d'être vérifié, ou s'il est
// calculé sur autre chose que les octets reçus, n'importe qui affiche ce qu'il
// veut sur le stream. D'où le cas « même JSON, sérialisation différente » :
// c'est celui qui casse dès que quelqu'un réintroduit un
// `JSON.stringify(req.body)` à la place du corps brut.
//
// ENSUITE, DEUX PROPRIÉTÉS QUI NE SE VOIENT PAS EN RELISANT LA ROUTE :
//   - un sub OFFERT ne doit produire qu'UNE alerte (le gift), pas une par
//     bénéficiaire — sinon offrir 20 abonnements bloque l'antenne ;
//   - un rejeu de Twitch (même `message_id`, parce qu'il n'a pas eu son 2xx à
//     temps) ne doit pas annoncer deux fois le même sub.
//
// ENFIN, LA DISTINCTION QUI COÛTE CHER SI ON LA PERD : « chaîne inconnue »
// (200, acquitté) et « lecture en échec » (503, réessayable) ne sont pas la
// même chose. Les confondre perdrait des alertes en silence pendant une panne.

import { Readable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SECRET = 'test-eventsub-secret';
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const BROADCASTER_ID = '1457667837';

import {
  store,
  resetSupabaseMock,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { computeTwitchSignature } from '../../utils/twitch/eventsubRequest';
import handler from '../../pages/api/webhooks/twitch/alerts';

/* ── Harnais ───────────────────────────────────────────────────────────── */

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
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

/**
 * Requête dont le corps est un FLUX : `bodyParser` est désactivé sur cette
 * route, le handler lit `req` octet par octet. Un objet `body` déjà parsé ne
 * testerait pas le bon chemin.
 */
function makeReq(over: {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): any {
  const raw = over.body ?? '';
  const req: any = Readable.from([Buffer.from(raw, 'utf8')]);
  req.method = over.method ?? 'POST';
  req.headers = { host: 'h', ...(over.headers ?? {}) };
  req.query = {};
  req.cookies = {};
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function signedHeaders(
  body: string,
  over: { id?: string; timestamp?: string; type?: string; secret?: string } = {}
): Record<string, string> {
  const id = over.id ?? 'msg-1';
  const timestamp = over.timestamp ?? new Date().toISOString();
  const type = over.type ?? 'notification';
  return {
    'twitch-eventsub-message-id': id,
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': computeTwitchSignature(
      over.secret ?? SECRET,
      id,
      timestamp,
      Buffer.from(body, 'utf8')
    ),
    'twitch-eventsub-message-type': type,
  };
}

function notification(type: string, event: Record<string, unknown>): string {
  return JSON.stringify({ subscription: { type }, event });
}

async function post(
  body: string,
  headers: Record<string, string> = signedHeaders(body)
) {
  const res = makeRes();
  await handler(makeReq({ body, headers }), res);
  return res;
}

function events() {
  return store.stream_alert_events ?? [];
}

let previousSecret: string | undefined;

beforeEach(() => {
  resetSupabaseMock();
  previousSecret = process.env.TWITCH_EVENTSUB_SECRET;
  process.env.TWITCH_EVENTSUB_SECRET = SECRET;
  // La chaîne connectée, telle qu'elle est en base.
  store.twitch_broadcaster_connections = [
    { tenant_id: TENANT, broadcaster_id: BROADCASTER_ID },
  ];
  store.stream_alert_events = [];
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.TWITCH_EVENTSUB_SECRET;
  else process.env.TWITCH_EVENTSUB_SECRET = previousSecret;
});

/* ── La signature ──────────────────────────────────────────────────────── */

describe('signature — la seule barrière', () => {
  it('refuse une signature invalide, sans rien écrire', async () => {
    const body = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Pirate',
    });
    const res = await post(body, {
      ...signedHeaders(body),
      'twitch-eventsub-message-signature': 'sha256=deadbeef',
    });
    expect(res.statusCode).toBe(403);
    expect(events()).toHaveLength(0);
  });

  it('refuse un corps altéré après signature', async () => {
    const signé = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const altéré = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Pirate',
    });
    const res = await post(altéré, signedHeaders(signé));
    expect(res.statusCode).toBe(403);
    expect(events()).toHaveLength(0);
  });

  it('refuse le MÊME JSON sérialisé autrement', async () => {
    // Le cas qui casse dès que quelqu'un remplace le corps brut par un
    // `JSON.stringify(req.body)` : sémantiquement identique, octets différents.
    const body = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const reformaté = JSON.stringify(JSON.parse(body), null, 2);
    const res = await post(reformaté, signedHeaders(body));
    expect(res.statusCode).toBe(403);
  });

  it('refuse un message hors de la fenêtre anti-rejeu', async () => {
    // Une signature reste valide éternellement : sans borne, un message capté
    // une fois pourrait être rejoué des mois plus tard.
    const body = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const vieux = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const res = await post(body, signedHeaders(body, { timestamp: vieux }));
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('STALE_MESSAGE');
  });

  it('refuse tout quand le secret n’est pas configuré', async () => {
    // Fail-closed : sans secret, aucune signature n'est vérifiable.
    delete process.env.TWITCH_EVENTSUB_SECRET;
    const body = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const res = await post(body);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });
});

/* ── Activation et révocation ──────────────────────────────────────────── */

describe('poignée de main', () => {
  it('renvoie le challenge TEL QUEL, en texte brut', async () => {
    // Twitch n'active pas la souscription autrement — et une souscription non
    // activée ne se voit qu'au premier direct sans alertes.
    const body = JSON.stringify({
      challenge: 'abc-123',
      subscription: { type: 'channel.follow' },
    });
    const res = await post(
      body,
      signedHeaders(body, { type: 'webhook_callback_verification' })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('abc-123');
    expect(res.headers['Content-Type']).toBe('text/plain');
  });

  it('acquitte une révocation', async () => {
    const body = JSON.stringify({
      subscription: { type: 'channel.cheer', status: 'authorization_revoked' },
    });
    const res = await post(body, signedHeaders(body, { type: 'revocation' }));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('revoked');
  });
});

/* ── Ce qui s'écrit ────────────────────────────────────────────────────── */

describe('dépôt des alertes', () => {
  it('écrit un cheer avec son auteur et ses bits', async () => {
    const body = notification('channel.cheer', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Aru',
      bits: 1500,
    });
    const res = await post(body);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('stored');
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      tenant_id: TENANT,
      kind: 'cheer',
      actor_name: 'Aru',
      amount: 1500,
    });
  });

  it('classe un raid sous la chaîne QUI LE REÇOIT', async () => {
    const body = notification('channel.raid', {
      from_broadcaster_user_id: '999',
      from_broadcaster_user_name: 'Iguel',
      to_broadcaster_user_id: BROADCASTER_ID,
      viewers: 42,
    });
    await post(body);
    expect(events()[0]).toMatchObject({
      tenant_id: TENANT,
      kind: 'raid',
      actor_name: 'Iguel',
      amount: 42,
    });
  });

  it('n’annonce qu’UNE fois un sub offert en masse', async () => {
    // Le gift compte ; les `channel.subscribe` de chaque bénéficiaire, non.
    const gift = notification('channel.subscription.gift', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Généreuse',
      total: 20,
      is_anonymous: false,
    });
    await post(gift, signedHeaders(gift, { id: 'gift-1' }));

    for (let i = 0; i < 3; i += 1) {
      const sub = notification('channel.subscribe', {
        broadcaster_user_id: BROADCASTER_ID,
        user_name: `Bénéficiaire${i}`,
        is_gift: true,
      });
      const res = await post(sub, signedHeaders(sub, { id: `sub-${i}` }));
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ignored_event_type');
    }

    expect(events()).toHaveLength(1);
    expect(events()[0].kind).toBe('gift');
  });

  it('un rejeu de Twitch ne crée pas de doublon', async () => {
    // Twitch REJOUE quand il n'a pas eu son 2xx à temps, avec le même
    // `message_id` : c'est la contrainte d'unicité qui tient l'antenne.
    const body = notification('channel.subscribe', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
      tier: '1000',
      is_gift: false,
    });
    const headers = signedHeaders(body, { id: 'msg-rejeu' });
    await post(body, headers);
    await post(body, signedHeaders(body, { id: 'msg-rejeu' }));
    expect(events()).toHaveLength(1);
  });
});

/* ── Ce qui ne s'écrit pas ─────────────────────────────────────────────── */

describe('acquitter largement, refuser étroitement', () => {
  it('acquitte une chaîne qu’aucun espace n’a connectée', async () => {
    // 200 : un échec ferait retenter Twitch puis désactiver la souscription.
    const body = notification('channel.follow', {
      broadcaster_user_id: 'chaine-inconnue',
      user_name: 'Machine',
    });
    const res = await post(body);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('unknown_channel');
    expect(events()).toHaveLength(0);
  });

  it('acquitte un type auquel on n’est pas abonné', async () => {
    const body = notification('channel.ban', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const res = await post(body);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ignored_event_type');
  });

  it('DEMANDE UN RÉESSAI quand l’écriture échoue', async () => {
    // Une alerte perdue ne se voit pas : c'est exactement ce que le réessai de
    // Twitch sait rattraper, à condition de ne pas acquitter à tort.
    setTableWriteError('stream_alert_events', { message: 'boom' });
    const body = notification('channel.follow', {
      broadcaster_user_id: BROADCASTER_ID,
      user_name: 'Machine',
    });
    const res = await post(body);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WRITE_FAILED');
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('refuse une autre méthode que POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
