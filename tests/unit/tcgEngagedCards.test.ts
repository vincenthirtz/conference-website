// tests/unit/tcgEngagedCards.test.ts
//
// Exemplaires PROMIS dans une proposition d'échange en attente.
// Cibles : utils/tcg/engagedCards.ts, pages/api/player/tcg/collection.ts,
//          pages/api/player/tcg/trades/cards.ts.
//
// LE CONSTAT. `tcg_propose_trade` réserve un exemplaire précis dès la
// proposition ; le composeur d'échange le reflétait (`available`), la
// collection non. « Recycler » s'affichait sans un mot sur une carte promise,
// la route de recyclage l'acceptait, et la PARTENAIRE découvrait l'échange
// annulé en voulant l'accepter.
//
// CE QUE CES CAS PROTÈGENT.
//   1. UNE SEULE RÈGLE « ENGAGÉ », celle de la fonction SQL : côté `offered`,
//      proposition `pending` non échue, de CETTE proposante, dans CET espace.
//   2. LA COLLECTION EXPOSE le compte par sujet, et dit si l'exemplaire
//      désigné au recyclage est l'un des promis.
//   3. À VALEUR ÉGALE, la copie libre est désignée plutôt que la promise ;
//      JAMAIS une copie plus précieuse pour sauver un échange.
//   4. BEST-EFFORT : rien de tout cela ne fait tomber la collection.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  copyRef,
  readEngagedCopies,
  summarizeEngagedItems,
} from '../../utils/tcg/engagedCards';
import collectionHandler from '../../pages/api/player/tcg/collection';
import cardsHandler from '../../pages/api/player/tcg/trades/cards';

const TENANT = DEFAULT_TENANT_ID;
const OTHER_TENANT = '5b8e2f14-7c3a-4d9e-8f1b-2a6c4e8d0f13';
const ALICE = '3f6c2a1e-8b4d-4c7e-9a2b-1d5e6f7a8b9c';
const BRUNE = '9d4b7e21-3a6c-4f8d-b2e5-7c1a9f3d6e40';
const PLAYER_X = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PLAYER_Y = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const PACK_A = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80';
const PACK_B = 'e5f6a7b8-c9d0-4e1f-8a3b-4c5d6e7f8091';
const TRADE_1 = '7a1e4c2b-9d3f-4b6a-8e5c-2f7d1a9b3c80';
const TRADE_2 = '8b2f5d3c-0e4a-4c7b-9f6d-3a8e2b0c4d91';

let _token = 0;
function req(over: Record<string, unknown> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: undefined,
    ...over,
  };
}

function res(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.body = b), r);
  r.end = () => r;
  r.setHeader = (k: string, v: unknown) => {
    r.headers[k] = v;
  };
  return r;
}

const future = () => new Date(Date.now() + 3600_000).toISOString();
const past = () => new Date(Date.now() - 3600_000).toISOString();

function seedPacks() {
  store.tcg_packs = [PACK_A, PACK_B].map((id) => ({
    id,
    tenant_id: TENANT,
    user_id: ALICE,
    source_kind: 'victory',
    source_match_id: null,
    granted_at: '2026-08-01T00:00:00.000Z',
    opened_at: '2026-08-01T00:00:00.000Z',
  })) as any;
}

function card(
  pack: string,
  position: number,
  userId: string,
  over: Record<string, unknown> = {}
) {
  return {
    pack_id: pack,
    position,
    subject_kind: 'player',
    card_user_id: userId,
    card_team_id: null,
    card_map_slug: null,
    rarity: 'common',
    is_foil: false,
    recycled_at: null,
    ...over,
  };
}

function seedTrade(id: string, over: Record<string, unknown> = {}) {
  (store.tcg_trades ||= []).push({
    id,
    tenant_id: TENANT,
    proposer_id: ALICE,
    recipient_id: BRUNE,
    status: 'pending',
    expires_at: future(),
    ...over,
  });
}

function seedOffered(
  tradeId: string,
  pack: string,
  position: number,
  userId: string,
  side: 'offered' | 'requested' = 'offered'
) {
  const items = (store.tcg_trade_items ||= []);
  items.push({
    trade_id: tradeId,
    side,
    ordinal: items.length,
    subject_kind: 'player',
    card_user_id: userId,
    card_team_id: null,
    card_map_slug: null,
    rarity: 'common',
    is_foil: false,
    from_pack_id: side === 'offered' ? pack : null,
    from_position: side === 'offered' ? position : null,
  });
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: ALICE });
});

/* -------------------------------------------------------------------------- */
/* Le calcul partagé                                                           */
/* -------------------------------------------------------------------------- */

describe('summarizeEngagedItems — pur', () => {
  it('compte par sujet et désigne chaque exemplaire', () => {
    const out = summarizeEngagedItems([
      {
        subject_kind: 'player',
        card_user_id: PLAYER_X,
        card_team_id: null,
        card_map_slug: null,
        from_pack_id: PACK_A,
        from_position: 0,
      },
      {
        subject_kind: 'player',
        card_user_id: PLAYER_X,
        card_team_id: null,
        card_map_slug: null,
        from_pack_id: PACK_A,
        from_position: 1,
      },
      {
        subject_kind: 'map',
        card_user_id: null,
        card_team_id: null,
        card_map_slug: 'kings-row',
        from_pack_id: PACK_B,
        from_position: 3,
      },
    ]);
    expect(out.bySubject.get(`player:${PLAYER_X}`)).toBe(2);
    expect(out.bySubject.get('map:kings-row')).toBe(1);
    expect(out.copies.has(copyRef(PACK_A, 1))).toBe(true);
    expect(out.copies.has(copyRef(PACK_B, 3))).toBe(true);
  });

  it('un même exemplaire vu deux fois ne compte qu’une fois ; une ligne sans sujet est sautée', () => {
    const row = {
      subject_kind: 'player',
      card_user_id: PLAYER_X,
      card_team_id: null,
      card_map_slug: null,
      from_pack_id: PACK_A,
      from_position: 0,
    };
    const out = summarizeEngagedItems([
      row,
      { ...row },
      { ...row, card_user_id: null, from_position: 5 },
    ]);
    expect(out.bySubject.get(`player:${PLAYER_X}`)).toBe(1);
    expect(out.copies.size).toBe(1);
  });
});

describe('readEngagedCopies — la règle de la fonction SQL', () => {
  it('ne retient que MES propositions en attente non échues, dans CET espace, côté offert', async () => {
    seedTrade(TRADE_1); // compte
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);
    seedOffered(TRADE_1, PACK_A, 9, PLAYER_Y, 'requested'); // demandée : ne réserve rien

    seedTrade('11111111-0000-4000-8000-000000000001', { expires_at: past() });
    seedOffered('11111111-0000-4000-8000-000000000001', PACK_A, 1, PLAYER_X);

    seedTrade('11111111-0000-4000-8000-000000000002', { status: 'accepted' });
    seedOffered('11111111-0000-4000-8000-000000000002', PACK_A, 2, PLAYER_X);

    seedTrade('11111111-0000-4000-8000-000000000003', {
      proposer_id: BRUNE,
      recipient_id: ALICE,
    });
    seedOffered('11111111-0000-4000-8000-000000000003', PACK_B, 0, PLAYER_X);

    seedTrade('11111111-0000-4000-8000-000000000004', {
      tenant_id: OTHER_TENANT,
    });
    seedOffered('11111111-0000-4000-8000-000000000004', PACK_A, 3, PLAYER_X);

    const out = await readEngagedCopies(TENANT, ALICE);
    expect(out.ok).toBe(true);
    expect(out.bySubject.get(`player:${PLAYER_X}`)).toBe(1);
    expect(out.bySubject.has(`player:${PLAYER_Y}`)).toBe(false);
    expect([...out.copies]).toEqual([copyRef(PACK_A, 0)]);
  });

  it('aucune proposition : résultat vide, sans lire les items', async () => {
    const out = await readEngagedCopies(TENANT, ALICE);
    expect(out.ok).toBe(true);
    expect(out.bySubject.size).toBe(0);
    expect(out.copies.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* La collection                                                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — exemplaires engagés', () => {
  it('sans échange : 0 engagé, rien à signaler', async () => {
    seedPacks();
    store.tcg_pack_cards = [
      card(PACK_A, 0, PLAYER_X),
      card(PACK_A, 1, PLAYER_X),
    ] as any;
    const r = res();
    await collectionHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.cards[0]).toMatchObject({
      count: 2,
      engagedCopies: 0,
      recyclableEngaged: false,
    });
  });

  it('expose le compte, et signale quand l’exemplaire désigné EST le promis', async () => {
    // Commune promise + épique libre : on ne brûle JAMAIS l'épique pour sauver
    // l'échange ; la commune reste désignée, et la page avertit.
    seedPacks();
    store.tcg_pack_cards = [
      card(PACK_A, 0, PLAYER_X, { rarity: 'common' }),
      card(PACK_A, 1, PLAYER_X, { rarity: 'epic' }),
    ] as any;
    seedTrade(TRADE_1);
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);

    const r = res();
    await collectionHandler(req(), r);
    const c = r.body.cards[0];
    expect(c.recyclable).toEqual({ packId: PACK_A, position: 0 });
    expect(c.engagedCopies).toBe(1);
    expect(c.recyclableEngaged).toBe(true);
  });

  it('à valeur égale, désigne la copie LIBRE plutôt que la promise', async () => {
    seedPacks();
    // Ordre de lecture : la promise d'abord — sans la préférence, c'est elle
    // qui resterait désignée (le premier « pire » rencontré).
    store.tcg_pack_cards = [
      card(PACK_A, 0, PLAYER_X),
      card(PACK_B, 0, PLAYER_X),
    ] as any;
    seedTrade(TRADE_1);
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);

    const r = res();
    await collectionHandler(req(), r);
    const c = r.body.cards[0];
    expect(c.recyclable).toEqual({ packId: PACK_B, position: 0 });
    expect(c.engagedCopies).toBe(1);
    expect(c.recyclableEngaged).toBe(false);
  });

  it('toutes les copies équivalentes promises : désignée ET signalée', async () => {
    seedPacks();
    store.tcg_pack_cards = [
      card(PACK_A, 0, PLAYER_X),
      card(PACK_B, 0, PLAYER_X),
    ] as any;
    seedTrade(TRADE_1);
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);
    seedTrade(TRADE_2, {
      recipient_id: 'c2a7e5d1-6b3f-4a8e-9d2c-5f1b8e3a7d64',
    });
    seedOffered(TRADE_2, PACK_B, 0, PLAYER_X);

    const r = res();
    await collectionHandler(req(), r);
    const c = r.body.cards[0];
    expect(c.engagedCopies).toBe(2);
    expect(c.recyclableEngaged).toBe(true);
  });

  it('un exemplaire unique promis : compté, mais jamais « recyclable engagé »', async () => {
    seedPacks();
    store.tcg_pack_cards = [card(PACK_A, 0, PLAYER_X)] as any;
    seedTrade(TRADE_1);
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);

    const r = res();
    await collectionHandler(req(), r);
    const c = r.body.cards[0];
    expect(c.recyclable).toBeNull();
    expect(c.engagedCopies).toBe(1);
    expect(c.recyclableEngaged).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Le composeur, désormais sur le même calcul                                  */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/trades/cards — `available` sur le calcul partagé', () => {
  it('retire les exemplaires promis et ignore une proposition échue', async () => {
    seedPacks();
    store.tcg_pack_cards = [
      card(PACK_A, 0, PLAYER_X),
      card(PACK_A, 1, PLAYER_X),
      card(PACK_A, 2, PLAYER_X),
    ] as any;
    seedTrade(TRADE_1);
    seedOffered(TRADE_1, PACK_A, 0, PLAYER_X);
    seedTrade(TRADE_2, { expires_at: past() });
    seedOffered(TRADE_2, PACK_A, 1, PLAYER_X);

    const r = res();
    await cardsHandler(req(), r);
    expect(r.statusCode).toBe(200);
    expect(r.body.cards[0]).toMatchObject({
      copies: 3,
      tradeableCopies: 3,
      available: 2,
    });
  });
});
