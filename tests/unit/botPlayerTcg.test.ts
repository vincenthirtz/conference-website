// tests/unit/botPlayerTcg.test.ts
// GET /api/bot/v1/players/by-discord/[discordUserId]/tcg
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE SCOPING TENANT. Une joueuse peut jouer dans plusieurs organisations ;
//      son TCG est celui du tenant qui interroge. Sans scoping, le bot d'un
//      tenant lirait les paquets gagnés chez un autre.
//   2. LE RÉSUMÉ, PAS LA COLLECTION. La route rend des compteurs et la
//      meilleure rareté — jamais la liste des cartes, et surtout aucune face
//      ni photo : `readCardFaces` doit rester la seule voie d'accès aux photos
//      consenties, avec son filtre `approved` ET non révoquée.
//   3. LE BARÈME VIENT DU SERVEUR. `boosterPrice` est rendu pour que le bot
//      l'affiche sans le connaître ; un test qui écrirait « 300 » en dur
//      figerait ce qu'il est censé laisser réglable.
//   4. UN PAQUET FERMÉ NE COMPTE PAS dans la collection : elle se déduit des
//      paquets OUVERTS.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { BOOSTER_PRICE_COINS } from '../../utils/tcg/economy';

import handler from '../../pages/api/bot/v1/players/by-discord/[discordUserId]/tcg';

const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PLAYER_DISCORD = '900000000000000001';
const UNLINKED_DISCORD = '900000000000000009';
const PLAYER = '11111111-1111-4111-8111-111111111111';

const OPENED_PACK = '22222222-2222-4222-8222-222222222222';
const CLOSED_PACK = '33333333-3333-4333-8333-333333333333';

function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  return {
    method: 'GET',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT_ID,
    },
    query: { discordUserId: PLAYER_DISCORD },
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

function seedLink() {
  store.user_discord_links = [
    { auth_user_id: PLAYER, discord_user_id: PLAYER_DISCORD },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  seedLink();
});

describe('GET /api/bot/v1/players/by-discord/[id]/tcg', () => {
  it('404 NOT_LINKED quand le compte Discord n’est lié à personne', async () => {
    // Le bot doit distinguer ce cas d'une erreur de lecture : ici il propose
    // /inscription, là il invite à réessayer.
    const res = makeRes();
    await handler(makeReq({ query: { discordUserId: UNLINKED_DISCORD } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('NOT_LINKED');
  });

  it('400 sur un identifiant Discord malformé', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { discordUserId: 'pas-un-id' } }), res);

    expect(res.statusCode).toBe(400);
  });

  it('rend le solde, les paquets et le barème', async () => {
    store.tcg_wallets = [
      { tenant_id: CONFERENCE_TENANT_ID, user_id: PLAYER, balance: 250 },
    ] as any;
    store.tcg_packs = [
      {
        id: OPENED_PACK,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: PLAYER,
        opened_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: CLOSED_PACK,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: PLAYER,
        opened_at: null,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(250);
    expect(res.body.packs).toEqual({ unopened: 1, opened: 1, total: 2 });
    // La constante, jamais sa valeur recopiée.
    expect(res.body.boosterPrice).toBe(BOOSTER_PRICE_COINS);
  });

  it('résume la collection sans jamais rendre les cartes ni les faces', async () => {
    store.tcg_packs = [
      {
        id: OPENED_PACK,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: PLAYER,
        opened_at: '2026-01-02T00:00:00.000Z',
      },
    ] as any;
    store.tcg_pack_cards = [
      {
        pack_id: OPENED_PACK,
        subject_kind: 'player',
        card_user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        card_team_id: null,
        rarity: 'common',
      },
      // Même sujet : un exemplaire de plus, pas une carte distincte de plus.
      {
        pack_id: OPENED_PACK,
        subject_kind: 'player',
        card_user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        card_team_id: null,
        rarity: 'rare',
      },
      {
        pack_id: OPENED_PACK,
        subject_kind: 'team',
        card_user_id: null,
        card_team_id: 'bbbbbbbb-0000-4000-8000-000000000002',
        rarity: 'legendary',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.collection).toEqual({
      distinct: 2,
      total: 3,
      bestRarity: 'legendary',
    });
    // Le contrat est un RÉSUMÉ : aucune liste de cartes ne doit filtrer.
    expect(res.body.cards).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('imageUrl');
    expect(JSON.stringify(res.body)).not.toContain('photo');
  });

  it('ne compte pas les cartes d’un paquet encore FERMÉ', async () => {
    // La collection se déduit des paquets ouverts : un paquet fermé ne contient
    // encore rien, même si des lignes existaient par erreur.
    store.tcg_packs = [
      {
        id: CLOSED_PACK,
        tenant_id: CONFERENCE_TENANT_ID,
        user_id: PLAYER,
        opened_at: null,
      },
    ] as any;
    store.tcg_pack_cards = [
      {
        pack_id: CLOSED_PACK,
        subject_kind: 'player',
        card_user_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        card_team_id: null,
        rarity: 'legendary',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.collection).toEqual({
      distinct: 0,
      total: 0,
      bestRarity: null,
    });
    expect(res.body.packs.unopened).toBe(1);
  });

  it('ne voit pas les paquets gagnés dans un AUTRE tenant', async () => {
    // Le cas réel : une joueuse qui joue dans deux organisations. Son TCG est
    // celui du tenant qui interroge, pas la somme des deux.
    store.tcg_packs = [
      {
        id: OPENED_PACK,
        tenant_id: OTHER_TENANT,
        user_id: PLAYER,
        opened_at: null,
      },
    ] as any;
    store.tcg_wallets = [
      { tenant_id: OTHER_TENANT, user_id: PLAYER, balance: 999 },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.packs).toEqual({ unopened: 0, opened: 0, total: 0 });
    expect(res.body.balance).toBe(0);
  });

  it('rend un état vide, pas une erreur, pour une joueuse sans TCG', async () => {
    // Ne jamais avoir gagné est un état normal — c'est celui de la majorité.
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(0);
    expect(res.body.packs.total).toBe(0);
    expect(res.body.collection.bestRarity).toBeNull();
  });
});
