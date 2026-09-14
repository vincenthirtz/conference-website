// tests/unit/tcgPagination.test.ts
//
// Pagination par curseur de `/api/player/tcg/collection` et
// `/api/player/tcg/packs`, et la nouveauté d'une carte à l'ouverture.
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LA RÉTROCOMPATIBILITÉ. Sans paramètre, les deux routes rendent la forme
//      d'avant plus `nextCursor`. Un client qui ignore le champ (le bot, une
//      version en cache de la page) ne doit rien perdre.
//
//   2. UN PARCOURS COMPLET NE RÉPÈTE NI N'OMET RIEN. C'est la seule propriété
//      qui compte d'une pagination, et elle casse précisément sur les EX ÆQUO
//      (même rareté, même date d'attribution) — d'où des fixtures qui en sont
//      pleines.
//
//   3. UN CURSEUR FORGÉ EST REFUSÉ. Celui des paquets est interpolé dans un
//      filtre PostgREST : une virgule qui y passerait réécrirait la requête.
//
//   4. LE PLAFOND DE 1000 LIGNES N'AMPUTE PLUS LA COLLECTION. L'ancien
//      `.limit(5000)` était en réalité servi à 1000 par PostgREST.
//
//   5. « NOUVELLE » EST DIT PAR LE SERVEUR. Une collection paginée ne permet
//      plus à la page de savoir ce qu'on possède déjà.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  decodeCollectionCursor,
  decodePacksCursor,
  encodeCollectionCursor,
  encodePacksCursor,
  parsePageLimit,
} from '../../utils/tcg/pageCursor';
import { READ_PAGE } from '../../utils/tcg/readOwnedCards';

import collectionHandler from '../../pages/api/player/tcg/collection';
import packsHandler from '../../pages/api/player/tcg/packs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

let _n = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _n += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      // Une IP par requête : les parcours de pages en enchaînent beaucoup, et
      // c'est la pagination qu'on teste, pas le limiteur.
      'x-real-ip': `10.0.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Un UUID v4 bien formé, dérivé d'un entier (cf. `zod-uuid-test-fixtures`). */
function uuid(prefix: string, i: number): string {
  const hex = i.toString(16).padStart(12, '0');
  return `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${hex}`;
}

function seedOpenedPack(id: string, userId = OWNER) {
  (store.tcg_packs ||= []).push({
    id,
    tenant_id: DEFAULT_TENANT_ID,
    user_id: userId,
    source_kind: 'victory',
    source_match_id: uuid('44444444', _n),
    granted_at: '2026-01-01T00:00:00.000Z',
    opened_at: '2026-01-02T00:00:00.000Z',
  });
}

function seedPlayerCard(
  packId: string,
  position: number,
  userId: string,
  rarity = 'common',
  recycledAt: string | null = null
) {
  (store.tcg_pack_cards ||= []).push({
    pack_id: packId,
    position,
    subject_kind: 'player',
    card_user_id: userId,
    card_team_id: null,
    card_map_slug: null,
    rarity,
    is_foil: false,
    recycled_at: recycledAt,
  });
}

async function getCollection(query: Record<string, unknown> = {}) {
  const res = makeRes();
  await collectionHandler(makeReq({ query }), res);
  return res;
}

async function getPacks(query: Record<string, unknown> = {}) {
  const res = makeRes();
  await packsHandler(makeReq({ query }), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: OWNER });
});

/* -------------------------------------------------------------------------- */
/* Utilitaire de curseur                                                       */
/* -------------------------------------------------------------------------- */

describe('pageCursor', () => {
  it('borne `limit` à [1, 200] et refuse le reste au lieu de le rogner', () => {
    expect(parsePageLimit(undefined)).toBeNull();
    expect(parsePageLimit('1')).toBe(1);
    expect(parsePageLimit('200')).toBe(200);
    expect(parsePageLimit('0')).toBe('invalid');
    expect(parsePageLimit('201')).toBe('invalid');
    expect(parsePageLimit('-3')).toBe('invalid');
    expect(parsePageLimit('2.5')).toBe('invalid');
    expect(parsePageLimit('abc')).toBe('invalid');
    // `?limit=1&limit=2` arrive en tableau : ambigu, donc refusé.
    expect(parsePageLimit(['1', '2'])).toBe('invalid');
  });

  it('fait l’aller-retour d’un curseur de collection', () => {
    const key = `player:${OWNER}`;
    const raw = encodeCollectionCursor({ rarity: 'epic', key });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCollectionCursor(raw)).toEqual({ rarity: 'epic', key });
    expect(
      decodeCollectionCursor(
        encodeCollectionCursor({ rarity: 'common', key: 'map:kings-row' })
      )
    ).toEqual({ rarity: 'common', key: 'map:kings-row' });
  });

  it('garde les microsecondes d’un horodatage PostgREST', () => {
    // Renormaliser en `toISOString()` les tronquerait, et le filtre « avant ce
    // paquet » sauterait ceux attribués dans la même milliseconde.
    const grantedAt = '2026-09-14T10:00:00.123456+00:00';
    const raw = encodePacksCursor({ grantedAt, id: OWNER });
    expect(decodePacksCursor(raw)).toEqual({ grantedAt, id: OWNER });
  });

  it('refuse un curseur de paquets qui tenterait d’injecter un filtre', () => {
    const forge = (payload: unknown) =>
      Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(
      decodePacksCursor(
        forge({ g: '2026-01-01T00:00:00Z,user_id.neq.x', i: OWNER })
      )
    ).toBeNull();
    expect(
      decodePacksCursor(forge({ g: '2026-01-01T00:00:00Z', i: `${OWNER})` }))
    ).toBeNull();
    expect(decodePacksCursor('pas un curseur')).toBeNull();
    expect(decodePacksCursor(forge([1, 2]))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Collection                                                                  */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — pagination', () => {
  /** Cinq sujets, dont trois EX ÆQUO en `common` : le cas où l'ordre casse. */
  function seedFive() {
    const pack = uuid('22222222', 1);
    seedOpenedPack(pack);
    const rarities = ['common', 'legendary', 'common', 'rare', 'common'];
    rarities.forEach((rarity, i) => {
      seedPlayerCard(pack, i, uuid('aaaaaaaa', i + 1), rarity);
    });
    // Un doublon : `total` doit compter les exemplaires de TOUTE la collection.
    seedPlayerCard(pack, 5, uuid('aaaaaaaa', 1), 'common');
  }

  it('sans paramètre, rend toute la collection et `nextCursor: null`', async () => {
    seedFive();
    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body.cards).toHaveLength(5);
    expect(res.body.distinct).toBe(5);
    expect(res.body.total).toBe(6);
    expect(res.body.nextCursor).toBeNull();
    // Rien de personnel ne doit être gardé par un intermédiaire.
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('parcourt toutes les pages sans répéter ni omettre une carte', async () => {
    seedFive();
    const all = (await getCollection()).body.cards.map((c: any) => c.userId);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await getCollection(
        cursor ? { limit: '2', cursor } : { limit: '2' }
      );
      expect(res.statusCode).toBe(200);
      // Les compteurs décrivent la collection ENTIÈRE sur chaque page.
      expect(res.body.distinct).toBe(5);
      expect(res.body.total).toBe(6);
      expect(res.body.cards.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.cards.map((c: any) => c.userId));
      cursor = res.body.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    // Même ordre que la réponse d'un seul tenant : rareté puis clé.
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(5);
    expect(seen[0]).toBe(uuid('aaaaaaaa', 2)); // la légendaire d'abord
  });

  it('rend `nextCursor: null` sur une dernière page PLEINE', async () => {
    // Le piège classique : 4 cartes, pages de 2 — la seconde page est pleine
    // et pourtant la dernière. Un « page pleine ⇒ il en reste » ferait
    // demander une troisième page vide.
    const pack = uuid('22222222', 1);
    seedOpenedPack(pack);
    for (let i = 0; i < 4; i++) seedPlayerCard(pack, i, uuid('aaaaaaaa', i));

    const first = await getCollection({ limit: '2' });
    expect(first.body.nextCursor).not.toBeNull();
    const second = await getCollection({
      limit: '2',
      cursor: first.body.nextCursor,
    });
    expect(second.body.cards).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
  });

  it('un curseur au-delà de la fin rend une page vide, pas une erreur', async () => {
    seedFive();
    const cursor = encodeCollectionCursor({
      rarity: 'common',
      key: 'player:ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    const res = await getCollection({ cursor });

    expect(res.statusCode).toBe(200);
    expect(res.body.cards).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.distinct).toBe(5);
  });

  it('reprend au bon endroit même si la dernière carte servie a disparu', async () => {
    // Recyclée jusqu'au dernier exemplaire entre deux pages : le curseur la
    // situe toujours dans l'ordre, sans répéter la page précédente.
    seedFive();
    const first = await getCollection({ limit: '2' });
    const lastServed = first.body.cards[1].userId;
    for (const c of store.tcg_pack_cards as any[]) {
      if (c.card_user_id === lastServed) c.recycled_at = '2026-09-15T00:00:00Z';
    }

    const next = await getCollection({
      limit: '2',
      cursor: first.body.nextCursor,
    });
    const ids = next.body.cards.map((c: any) => c.userId);
    expect(ids).not.toContain(first.body.cards[0].userId);
    expect(ids).toHaveLength(2);
  });

  it.each([
    ['du charabia', 'zzz***'],
    ['un JSON sans rareté', Buffer.from('{"k":"map:x"}').toString('base64url')],
    [
      'une rareté inventée',
      Buffer.from(
        JSON.stringify({ r: 'mythic', k: `player:${OWNER}` })
      ).toString('base64url'),
    ],
    [
      'une clé de sujet malformée',
      Buffer.from(JSON.stringify({ r: 'rare', k: 'player:1' })).toString(
        'base64url'
      ),
    ],
  ])('refuse %s en curseur : 400 invalid_cursor', async (_label, cursor) => {
    seedFive();
    const res = await getCollection({ cursor });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_cursor');
  });

  it.each(['0', '201', 'abc'])(
    'refuse limit=%s : 400 invalid_limit',
    async (limit) => {
      const res = await getCollection({ limit });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('invalid_limit');
    }
  );

  it('ne met aucune URL d’image dans le curseur', async () => {
    // Une face se relit à chaque affichage : figée dans un curseur, une photo
    // survivrait au retrait du consentement de la joueuse.
    seedFive();
    (store.player_ratings ||= []).push({
      user_id: uuid('aaaaaaaa', 2),
      tenant_id: DEFAULT_TENANT_ID,
      display_name: 'Légendaire',
      avatar_url: 'https://cdn.test/avatar.png',
      rating: 1500,
    });
    const res = await getCollection({ limit: '1' });
    const decoded = Buffer.from(res.body.nextCursor, 'base64url').toString();
    expect(decoded).not.toContain('http');
    expect(decoded).not.toContain('avatar');
  });

  it('compte au-delà du plafond de 1000 lignes de PostgREST', async () => {
    // `READ_PAGE + 1` paquets d'une carte chacun : la lecture des paquets doit
    // demander une seconde page, sans quoi la dernière carte disparaît.
    for (let i = 0; i <= READ_PAGE; i++) {
      const pack = uuid('22222222', i);
      seedOpenedPack(pack);
      seedPlayerCard(pack, 0, uuid('aaaaaaaa', i));
    }
    // Une carte d'une autre joueuse : le parcours reste scopé.
    seedOpenedPack(uuid('33333333', 1), OTHER);
    seedPlayerCard(uuid('33333333', 1), 0, uuid('bbbbbbbb', 1));

    const res = await getCollection({ limit: '1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(READ_PAGE + 1);
    expect(res.body.distinct).toBe(READ_PAGE + 1);
  });
});

/* -------------------------------------------------------------------------- */
/* Paquets                                                                     */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/packs — pagination', () => {
  function seedPacks(count: number, over: { openedEvery?: number } = {}) {
    store.tcg_packs = Array.from({ length: count }, (_, i) => ({
      id: uuid('22222222', i + 1),
      tenant_id: DEFAULT_TENANT_ID,
      user_id: OWNER,
      source_kind: 'purchase',
      source_match_id: null,
      // Des EX ÆQUO de date par paires : le second critère (`id`) doit trancher.
      granted_at: `2026-01-${String(10 + Math.floor(i / 2)).padStart(2, '0')}T00:00:00.000Z`,
      opened_at:
        over.openedEvery && i % over.openedEvery === 0
          ? '2026-02-01T00:00:00.000Z'
          : null,
    })) as any;
  }

  it('sans paramètre, garde la forme d’avant et ajoute `nextCursor`', async () => {
    seedPacks(3);
    const res = await getPacks();

    expect(res.statusCode).toBe(200);
    expect(res.body.packs).toHaveLength(3);
    expect(res.body.unopened).toBe(3);
    expect(res.body.nextCursor).toBeNull();
    expect(typeof res.body.boosterPrice).toBe('number');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('au-delà de 200 paquets, dit qu’il en reste et compte TOUS les fermés', async () => {
    // L'ancien `unopened` était calculé sur les 200 lignes lues : il annonçait
    // moins de paquets à ouvrir qu'il n'en existait.
    seedPacks(205);
    const res = await getPacks();

    expect(res.body.packs).toHaveLength(200);
    expect(res.body.nextCursor).not.toBeNull();
    expect(res.body.unopened).toBe(205);
  });

  it('parcourt les pages dans l’ordre (date puis id décroissants), sans doublon', async () => {
    seedPacks(7);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await getPacks(
        cursor ? { limit: '3', cursor } : { limit: '3' }
      );
      expect(res.statusCode).toBe(200);
      seen.push(...res.body.packs.map((p: any) => p.id));
      cursor = res.body.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    const expected = [...(store.tcg_packs as any[])]
      .sort((a, b) =>
        a.granted_at === b.granted_at
          ? a.id < b.id
            ? 1
            : -1
          : a.granted_at < b.granted_at
            ? 1
            : -1
      )
      .map((p) => p.id);
    expect(seen).toEqual(expected);
  });

  it('filtre `status=unopened` sans fausser le compte global', async () => {
    seedPacks(6, { openedEvery: 2 }); // 3 ouverts, 3 fermés
    const res = await getPacks({ status: 'unopened', limit: '2' });

    expect(res.body.packs).toHaveLength(2);
    expect(res.body.packs.every((p: any) => p.openedAt === null)).toBe(true);
    expect(res.body.nextCursor).not.toBeNull();
    expect(res.body.unopened).toBe(3);

    const rest = await getPacks({
      status: 'unopened',
      limit: '2',
      cursor: res.body.nextCursor,
    });
    expect(rest.body.packs).toHaveLength(1);
    expect(rest.body.nextCursor).toBeNull();
  });

  it('refuse un curseur, un statut ou une limite invalides', async () => {
    seedPacks(2);
    const bad = await getPacks({ cursor: 'nope!' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('invalid_cursor');

    const injected = await getPacks({
      cursor: Buffer.from(
        JSON.stringify({ g: '2026-01-01T00:00:00Z,user_id.neq.x', i: OWNER })
      ).toString('base64url'),
    });
    expect(injected.statusCode).toBe(400);

    const status = await getPacks({ status: 'all' });
    expect(status.statusCode).toBe(400);
    expect(status.body.code).toBe('invalid_status');

    const limit = await getPacks({ limit: '500' });
    expect(limit.statusCode).toBe(400);
    expect(limit.body.code).toBe('invalid_limit');
  });
});

/* -------------------------------------------------------------------------- */
/* POST — « nouvelle » décidé par le serveur                                   */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/packs — isNew', () => {
  const PACK = uuid('55555555', 1);
  const OLD_PACK = uuid('55555555', 2);
  const TEAM = '33333333-3333-4333-8333-333333333333';
  const P = [1, 2, 3].map((i) => uuid('aaaaaaaa', i));

  function seedPool() {
    // Exactement trois joueuses et une équipe : le tirage les prend toutes,
    // ce qui rend le résultat déterministe hors map.
    store.player_ratings = P.map((user_id, i) => ({
      user_id,
      tenant_id: DEFAULT_TENANT_ID,
      display_name: `Joueuse ${i}`,
      avatar_url: null,
      rating: 1500,
    })) as any;
    store.teams = [
      {
        id: TEAM,
        tenant_id: DEFAULT_TENANT_ID,
        name: 'Hinode Sparkles',
        slug: 'hinode-sparkles',
        logo_url: null,
        deleted_at: null,
        is_active: true,
      },
    ] as any;
    store.tcg_packs = [
      {
        id: PACK,
        tenant_id: DEFAULT_TENANT_ID,
        user_id: OWNER,
        source_kind: 'purchase',
        source_match_id: null,
        granted_at: '2026-03-01T00:00:00.000Z',
        opened_at: null,
      },
    ] as any;
  }

  it('marque nouvelles les cartes jamais possédées, et pas les autres', async () => {
    seedPool();
    // Déjà possédée : P[0]. Possédée PUIS recyclée : P[1] — elle redevient
    // nouvelle, puisqu'elle n'est plus dans la collection.
    seedOpenedPack(OLD_PACK);
    seedPlayerCard(OLD_PACK, 0, P[0]);
    seedPlayerCard(OLD_PACK, 1, P[1], 'common', '2026-02-01T00:00:00Z');
    // La même joueuse dans le paquet d'une AUTRE : ne compte pas pour moi.
    seedOpenedPack(uuid('66666666', 1), OTHER);
    seedPlayerCard(uuid('66666666', 1), 0, P[2]);

    const res = makeRes();
    await packsHandler(
      makeReq({ method: 'POST', body: { packId: PACK } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const byId = new Map(
      res.body.cards.map((c: any) => [c.userId ?? c.teamId ?? c.slug, c])
    );
    expect((byId.get(P[0]) as any).isNew).toBe(false);
    expect((byId.get(P[1]) as any).isNew).toBe(true);
    expect((byId.get(P[2]) as any).isNew).toBe(true);
    expect((byId.get(TEAM) as any).isNew).toBe(true);
    const map = res.body.cards.find((c: any) => c.kind === 'map');
    expect(map.isNew).toBe(true);
  });

  it('ne compte pas le paquet qu’on vient d’ouvrir comme « déjà possédé »', async () => {
    // Sans l'exclusion, les cartes à peine insérées se trouveraient elles-mêmes
    // et tout le paquet s'afficherait en doublons.
    seedPool();
    const res = makeRes();
    await packsHandler(
      makeReq({ method: 'POST', body: { packId: PACK } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.cards.every((c: any) => c.isNew === true)).toBe(true);
  });
});
