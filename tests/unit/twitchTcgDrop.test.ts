// Webhook entrant Twitch EventSub — drop TCG pendant un direct.
// Target: pages/api/webhooks/twitch/tcg-drop.ts
//
// CE QUE CES TESTS PROTÈGENT EN PRIORITÉ : la signature. C'est une URL PUBLIQUE
// qui distribue des récompenses ; si le HMAC cesse d'être vérifié, ou s'il est
// calculé sur autre chose que les octets reçus, n'importe qui peut se créditer.
// D'où les cas « corps altéré », « mauvais secret » et surtout « même JSON,
// sérialisation différente » : c'est ce dernier qui casse dès que quelqu'un
// réintroduit un `JSON.stringify(req.body)` à la place du corps brut.
//
// L'IDEMPOTENCE EST PROUVÉE SUR LA CONTRAINTE, PAS SUR UNE RELECTURE. Le mock
// Supabase honore `ignoreDuplicates` et ne rend, sur un `.select()` chaîné, que
// les lignes réellement insérées — la sémantique de `ON CONFLICT DO NOTHING …
// RETURNING`, vérifiée sur la vraie base (cf. tcgGrantVictoryRewards.test.ts).
// Un rejeu doit donc rendre `replayed` et ne rien ajouter.
//
// DEUX BLOCAGES SONT TESTÉS COMME TELS, PAS CONTOURNÉS :
//   - aucune table ne relie une identité Twitch à un compte du site ;
//   - `earnSources.ts` marque `twitch_drop` avec `schemaReady: false`.
// Les tests figent le comportement voulu dans cet état (200 + statut explicite,
// zéro écriture) ; ils devront être RELUS le jour où les migrations passent.

import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SECRET = 'test-eventsub-secret';

// Helix est mocké : aucun appel réseau, et on veut pouvoir affirmer que la
// résolution du direct n'est même PAS tentée tant que l'identité manque.
const { fetchTwitchLiveStatusMock } = vi.hoisted(() => ({
  fetchTwitchLiveStatusMock: vi.fn(async () => ({
    mychannel: { live: true, startedAt: '2026-09-13T20:00:00Z' },
  })),
}));
vi.mock('@/utils/twitch', () => ({
  fetchTwitchLiveStatus: fetchTwitchLiveStatusMock,
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { TWITCH_DROP_COINS, getEarnSource } from '../../utils/tcg/earnSources';
import handler, {
  computeTwitchSignature,
  grantTwitchDrop,
  resolveSiteUserFromTwitch,
  writeDropEntry,
} from '../../pages/api/webhooks/twitch/tcg-drop';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const BROADCASTER_ID = 'bc-123';
const BROADCASTER_LOGIN = 'mychannel';
const VIEWER_TWITCH_ID = 'tw-viewer-1';
const ALICE = 'user-alice';
const LIVE_REF = `${BROADCASTER_ID}:2026-09-13T20:00:00Z`;

const DROP_TYPE = 'channel.channel_points_custom_reward_redemption.add';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

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

/** En-têtes EventSub correctement signés pour ce corps. */
function signedHeaders(
  body: string,
  over: { id?: string; timestamp?: string; type?: string; secret?: string } = {}
): Record<string, string> {
  const id = over.id ?? 'msg-1';
  const timestamp = over.timestamp ?? new Date().toISOString();
  const type = over.type ?? 'notification';
  const signature = computeTwitchSignature(
    over.secret ?? SECRET,
    id,
    timestamp,
    Buffer.from(body, 'utf8')
  );
  return {
    'twitch-eventsub-message-id': id,
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': signature,
    'twitch-eventsub-message-type': type,
  };
}

/** Charge utile d'un échange de points de chaîne. */
function redemptionBody(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    subscription: { type: DROP_TYPE },
    event: {
      id: 'redemption-1',
      broadcaster_user_id: BROADCASTER_ID,
      broadcaster_user_login: BROADCASTER_LOGIN,
      user_id: VIEWER_TWITCH_ID,
      user_login: 'viewer',
      ...over,
    },
  });
}

function seedConnection() {
  store.twitch_broadcaster_connections = [
    {
      tenant_id: TENANT,
      broadcaster_id: BROADCASTER_ID,
      broadcaster_login: BROADCASTER_LOGIN,
    },
  ] as any;
}

function entries() {
  return (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
}
function wallets() {
  return (store.tcg_wallets ?? []) as Array<Record<string, unknown>>;
}

type Body = { ok?: boolean; status?: string; code?: string; error?: string };

beforeEach(() => {
  resetSupabaseMock();
  fetchTwitchLiveStatusMock.mockClear();
  process.env.TWITCH_EVENTSUB_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -----------------------------------------------------------
 * Garde d'entrée
 * ---------------------------------------------------------*/

describe('POST /api/webhooks/twitch/tcg-drop — garde d’entrée', () => {
  it('405 + Allow: POST sur une autre méthode', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
  });

  it('503 quand le secret n’est pas configuré (fail-closed)', async () => {
    // Sans secret, aucune signature n'est vérifiable : on refuse plutôt que
    // d'accepter aveuglément une charge qui distribue des récompenses.
    delete process.env.TWITCH_EVENTSUB_SECRET;
    const body = redemptionBody();
    const res = makeRes();
    await handler(makeReq({ body, headers: signedHeaders(body) }), res);
    expect(res.statusCode).toBe(503);
    expect((res.body as Body).code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  it('400 quand les en-têtes EventSub manquent', async () => {
    const res = makeRes();
    await handler(makeReq({ body: redemptionBody() }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('MISSING_HEADERS');
  });
});

/* -----------------------------------------------------------
 * Signature — le cœur du sujet
 * ---------------------------------------------------------*/

describe('signature', () => {
  it('403 et AUCUNE écriture quand le corps a été altéré après signature', async () => {
    const signed = signedHeaders(redemptionBody());
    const tampered = redemptionBody({ user_id: 'tw-attacker' });

    const res = makeRes();
    await handler(makeReq({ body: tampered, headers: signed }), res);

    expect(res.statusCode).toBe(403);
    expect((res.body as Body).code).toBe('INVALID_SIGNATURE');
    expect(entries()).toHaveLength(0);
  });

  it('403 quand la signature vient d’un autre secret', async () => {
    const body = redemptionBody();
    const res = makeRes();
    await handler(
      makeReq({ body, headers: signedHeaders(body, { secret: 'wrong' }) }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as Body).code).toBe('INVALID_SIGNATURE');
  });

  it('403 sur le MÊME JSON re-sérialisé autrement', async () => {
    // LE test anti-régression : la signature couvre les OCTETS, pas l'objet.
    // Quiconque remplacerait la lecture brute par `JSON.stringify(req.body)`
    // ferait rejeter des livraisons parfaitement valides — et ce cas le voit.
    const original = redemptionBody();
    const reserialized = JSON.stringify(JSON.parse(original), null, 2);
    expect(reserialized).not.toBe(original);

    const res = makeRes();
    await handler(
      makeReq({ body: reserialized, headers: signedHeaders(original) }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('calcule sha256=HMAC(secret, id + timestamp + corps)', async () => {
    const body = '{"a":1}';
    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', SECRET)
        .update('msg-9' + '2026-09-13T20:00:00Z')
        .update(Buffer.from(body, 'utf8'))
        .digest('hex');
    expect(
      computeTwitchSignature(
        SECRET,
        'msg-9',
        '2026-09-13T20:00:00Z',
        Buffer.from(body, 'utf8')
      )
    ).toBe(expected);
  });

  it('403 sur un message hors fenêtre, même correctement signé', async () => {
    // Une signature reste valide éternellement : sans borne temporelle, un
    // message capté une fois pourrait être rejoué indéfiniment.
    const body = redemptionBody();
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const res = makeRes();
    await handler(
      makeReq({ body, headers: signedHeaders(body, { timestamp: old }) }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as Body).code).toBe('STALE_MESSAGE');
  });

  it('400 sur un horodatage illisible', async () => {
    const body = redemptionBody();
    const res = makeRes();
    await handler(
      makeReq({
        body,
        headers: signedHeaders(body, { timestamp: 'pas-une-date' }),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('INVALID_TIMESTAMP');
  });
});

/* -----------------------------------------------------------
 * Types de message
 * ---------------------------------------------------------*/

describe('types de message', () => {
  it('renvoie le challenge TEL QUEL, en texte brut', async () => {
    // Twitch n'active la souscription qu'à cette condition. Répondre en JSON
    // échouerait en silence : la souscription resterait « pending ».
    const challenge = 'abcdef-challenge-123';
    const body = JSON.stringify({
      challenge,
      subscription: { type: DROP_TYPE },
    });
    const res = makeRes();
    await handler(
      makeReq({
        body,
        headers: signedHeaders(body, {
          type: 'webhook_callback_verification',
        }),
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(challenge);
    expect(res.getHeader('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('400 sur une vérification sans challenge', async () => {
    const body = JSON.stringify({ subscription: { type: DROP_TYPE } });
    const res = makeRes();
    await handler(
      makeReq({
        body,
        headers: signedHeaders(body, {
          type: 'webhook_callback_verification',
        }),
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('INVALID_PAYLOAD');
  });

  it('acquitte une révocation (rien à réessayer côté Twitch)', async () => {
    const body = JSON.stringify({ subscription: { type: DROP_TYPE } });
    const res = makeRes();
    await handler(
      makeReq({ body, headers: signedHeaders(body, { type: 'revocation' }) }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as Body).status).toBe('revoked');
  });

  it('acquitte un type de message inconnu mais signé', async () => {
    // Un ajout côté Twitch n'est pas une attaque : un 4xx ferait désactiver la
    // souscription.
    const body = redemptionBody();
    const res = makeRes();
    await handler(
      makeReq({
        body,
        headers: signedHeaders(body, { type: 'something_new' }),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as Body).status).toBe('ignored_message_type');
  });

  it('400 sur une notification malformée', async () => {
    const body = JSON.stringify({
      subscription: { type: DROP_TYPE },
      event: { id: 'r1' },
    });
    const res = makeRes();
    await handler(makeReq({ body, headers: signedHeaders(body) }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as Body).code).toBe('INVALID_PAYLOAD');
  });

  it('ignore un type d’événement hors sujet', async () => {
    const body = JSON.stringify({
      subscription: { type: 'channel.follow' },
      event: {
        id: 'f1',
        broadcaster_user_id: BROADCASTER_ID,
        user_id: VIEWER_TWITCH_ID,
      },
    });
    const res = makeRes();
    await handler(makeReq({ body, headers: signedHeaders(body) }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as Body).status).toBe('ignored_event_type');
    expect(entries()).toHaveLength(0);
  });
});

/* -----------------------------------------------------------
 * Acheminement : tenant, puis identité
 * ---------------------------------------------------------*/

describe('acheminement', () => {
  it('acquitte une chaîne qu’aucun tenant n’a connectée', async () => {
    store.twitch_broadcaster_connections = [] as any;
    const body = redemptionBody();
    const res = makeRes();
    await handler(makeReq({ body, headers: signedHeaders(body) }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as Body).status).toBe('unknown_channel');
    expect(entries()).toHaveLength(0);
  });

  it('s’arrête proprement faute de lien d’identité Twitch', async () => {
    // ÉTAT NOMINAL AUJOURD'HUI. Aucune table ne relie un compte Twitch à un
    // compte du site : la route le DIT (200 + statut) au lieu de deviner un
    // destinataire à partir du pseudo auto-déclaré, qui n'est jamais vérifié.
    seedConnection();
    const body = redemptionBody();
    const res = makeRes();
    await handler(makeReq({ body, headers: signedHeaders(body) }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as Body).status).toBe('identity_not_linked');
    expect((res.body as Body).code).toBe('IDENTITY_BACKEND_MISSING');
    expect(entries()).toHaveLength(0);
    // La résolution du direct n'est même pas tentée : inutile d'appeler Helix
    // pour une récompense qu'on ne saurait attribuer.
    expect(fetchTwitchLiveStatusMock).not.toHaveBeenCalled();
  });

  it('resolveSiteUserFromTwitch annonce le manque au lieu de deviner', async () => {
    expect(resolveSiteUserFromTwitch(VIEWER_TWITCH_ID)).toEqual({
      ok: false,
      reason: 'IDENTITY_BACKEND_MISSING',
    });
  });
});

/* -----------------------------------------------------------
 * Attribution
 * ---------------------------------------------------------*/

describe('attribution', () => {
  it('la source est ALLUMÉE : l’attribution n’est plus refusée d’office', async () => {
    // Ce cas figeait `schemaReady: false` et attendait `unsupported`. Il a fait
    // son travail : `tcg_twitch_drop.sql` (2026-09-13) a élargi le CHECK et la
    // bascule du drapeau a fait ÉCHOUER ce test — transformant une mise en
    // service silencieuse en signal bruyant. C'est exactement ce qu'on lui
    // demandait.
    //
    // Il garde donc le sens INVERSE : la source étant prête, `grantTwitchDrop`
    // ne doit plus rendre `unsupported`. Le chemin nominal et l'idempotence
    // sont couverts par les deux cas suivants, qui appellent `writeDropEntry`.
    expect(getEarnSource('twitch_drop')?.schemaReady).toBe(true);

    const outcome = await grantTwitchDrop({
      tenantId: TENANT,
      userId: ALICE,
      sourceRef: LIVE_REF,
    });

    expect(outcome).not.toBe('unsupported');
  });

  it('une source encore éteinte reste interdite d’écriture', async () => {
    // Le garde GÉNÉRIQUE survit à l'allumage du drop : `grantTwitchDrop` fige
    // sa clé (`EARN_SOURCE_KEY`), on ne peut donc pas le rebrancher sur une
    // autre source — mais le registre, lui, doit continuer d'exclure ce que le
    // CHECK n'accepte pas. `checkin_streak` n'a ni origine acceptée ni
    // écrivain : le jour où quelqu'un basculera son drapeau sans migrer, ce
    // cas le dira.
    expect(getEarnSource('checkin_streak')?.schemaReady).toBe(false);
  });

  it('crédite le barème du registre, une seule fois par direct', async () => {
    const first = await writeDropEntry({
      tenantId: TENANT,
      userId: ALICE,
      sourceRef: LIVE_REF,
    });
    expect(first).toBe('granted');

    expect(entries()).toHaveLength(1);
    expect(entries()[0].amount).toBe(TWITCH_DROP_COINS);
    expect(entries()[0].source_kind).toBe('twitch_drop');
    // `source_ref` = le DIRECT, pas l'échange : c'est lui qui plafonne à un
    // drop par live et par personne.
    expect(entries()[0].source_ref).toBe(LIVE_REF);
    expect(wallets().find((w) => w.user_id === ALICE)?.balance).toBe(
      TWITCH_DROP_COINS
    );
  });

  it('rejoué sur le même direct, n’ajoute RIEN', async () => {
    // L'idempotence vient de UNIQUE (tenant_id, user_id, source_kind,
    // source_ref), pas d'une relecture préalable — laquelle laisserait une
    // fenêtre entre la lecture et l'écriture (quatre doublons Discord le
    // 2026-09-12).
    const input = { tenantId: TENANT, userId: ALICE, sourceRef: LIVE_REF };
    expect(await writeDropEntry(input)).toBe('granted');
    expect(await writeDropEntry(input)).toBe('replayed');

    expect(entries()).toHaveLength(1);
    // Le solde n'a pas doublé : il se recalcule depuis le registre.
    expect(wallets().find((w) => w.user_id === ALICE)?.balance).toBe(
      TWITCH_DROP_COINS
    );
  });

  it('laisse un second direct récompenser la même personne', async () => {
    // La clé plafonne un drop PAR LIVE, elle n'interdit pas le live suivant.
    await writeDropEntry({
      tenantId: TENANT,
      userId: ALICE,
      sourceRef: LIVE_REF,
    });
    const next = await writeDropEntry({
      tenantId: TENANT,
      userId: ALICE,
      sourceRef: `${BROADCASTER_ID}:2026-09-20T20:00:00Z`,
    });

    expect(next).toBe('granted');
    expect(entries()).toHaveLength(2);
    expect(wallets().find((w) => w.user_id === ALICE)?.balance).toBe(
      2 * TWITCH_DROP_COINS
    );
  });

  it('traite un refus de contrainte comme définitif, pas comme une panne', async () => {
    // 23514 = le CHECK refuse. Réessayer donnerait le même refus : condamner
    // Twitch à un retry perpétuel ferait désactiver la souscription.
    const { supabaseAdmin } = await import('@/utils/supabase');
    vi.spyOn(supabaseAdmin as any, 'from').mockReturnValueOnce({
      upsert: () => ({
        select: async () => ({
          data: null,
          error: { code: '23514', message: 'source_kind check' },
        }),
      }),
    } as any);

    expect(
      await writeDropEntry({
        tenantId: TENANT,
        userId: ALICE,
        sourceRef: LIVE_REF,
      })
    ).toBe('unsupported');
  });
});
