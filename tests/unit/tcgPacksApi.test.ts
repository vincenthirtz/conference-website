// tests/unit/tcgPacksApi.test.ts
//
// `/api/player/tcg/packs` — la route qui porte l'économie du TCG, et qui
// n'avait aucun test.
//
// CE QUE CES CAS PROTÈGENT, ET POURQUOI ÇA SE PERD FACILEMENT.
//
//   1. LE BARÈME EST RENDU PAR L'API (`boosterPrice`, `earn`). L'interface les
//      AFFICHE sans les connaître : les recopier côté client ferait mentir la
//      page au premier réglage, et importer `economy.ts` dans le navigateur y
//      traînerait le moteur de rating dont le barème dérive. Un test qui
//      écrirait « 100 » en dur reproduirait exactement le défaut qu'on évite —
//      d'où l'import des constantes.
//
//   2. LA RÉPONSE DU POST PORTE LES FACES DES CARTES TIRÉES. Sans elles, la
//      page ne peut rien montrer de l'ouverture et se rabat sur un
//      rechargement de la collection, où le tirage se fond en silence. C'est
//      un champ de réponse : rien dans le typage de la page n'empêche
//      quelqu'un de l'élaguer un jour « parce qu'il fait doublon avec la
//      collection ». Ce test est ce qui s'y oppose.
//
//   3. LA RÉSERVATION EST ATOMIQUE. Deux ouvertures du même paquet ne peuvent
//      pas réussir toutes les deux.

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
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
} from '../../utils/tcg/economy';
import {
  BATTLENET_VERIFIED_COINS,
  CHECKIN_STREAK_COINS,
  CHECKIN_STREAK_LENGTH,
  COLLECTION_SET_COINS,
  MATCH_PREDICTION_COINS,
  PLACEMENT_TIERS,
  TWITCH_DROP_COINS,
  WELCOME_GIFT_COINS,
  earnReward,
} from '../../utils/tcg/earnSources';
import { PACK_SIZE } from '../../utils/tcg/drawPack';

import handler from '../../pages/api/player/tcg/packs';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const PACK = '22222222-2222-4222-8222-222222222222';
const TEAM = '33333333-3333-4333-8333-333333333333';

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
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

/**
 * Le vivier : assez de joueuses pour remplir un paquet sans que les équipes
 * viennent combler les emplacements manquants — sinon on testerait le repli,
 * pas le cas nominal.
 */
function seedPools() {
  store.player_ratings = Array.from({ length: 6 }, (_, i) => ({
    user_id: `aaaaaaaa-0000-4000-8000-00000000000${i}`,
    tenant_id: DEFAULT_TENANT_ID,
    display_name: `Joueuse ${i}`,
    avatar_url: null,
    battle_tag: null,
    rating: 1500,
    rd: 200,
    volatility: 0.06,
    peak_rating: 1500,
    games_played: 0,
    wins: 0,
    losses: 0,
  })) as any;

  store.teams = [
    {
      id: TEAM,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Hinode Sparkles',
      short_name: 'HIN',
      slug: 'hinode-sparkles',
      logo_url: '/img/teams-images/hinode-sparkles.png',
      deleted_at: null,
      is_active: true,
    },
  ] as any;
}

function seedPack(openedAt: string | null = null) {
  store.tcg_packs = [
    {
      id: PACK,
      tenant_id: DEFAULT_TENANT_ID,
      user_id: PLAYER,
      source_kind: 'victory',
      granted_at: '2026-01-01T00:00:00.000Z',
      opened_at: openedAt,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

/* -------------------------------------------------------------------------- */
/* GET — le barème vient du serveur                                            */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/packs', () => {
  it('rend le prix ET ce que rapporte une victoire', async () => {
    // Sans `earn`, la page affichait un solde et un prix sans jamais dire
    // comment gagner des pièces : à zéro, un montant et aucun chemin.
    seedPools();
    seedPack();

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    // Les constantes, jamais leur valeur recopiée : un test qui écrirait
    // « 100 » figerait le barème qu'il est censé laisser réglable.
    expect(res.body.boosterPrice).toBe(BOOSTER_PRICE_COINS);
    expect(res.body.earn).toEqual({
      matchWin: MATCH_WIN_COINS,
      scrimWin: SCRIM_WIN_COINS,
      // Ajouté pour le guide (`/player/tcg-guide`), qui énonce le barème et ne
      // doit surtout pas le recopier. Ce `toEqual` STRICT est volontaire : il
      // a fait échouer la construction le jour où ce champ est apparu, ce qui
      // est exactement son rôle — la forme de `earn` ne bouge pas en silence.
      welcomeGift: WELCOME_GIFT_COINS,
      checkinStreak: {
        length: CHECKIN_STREAK_LENGTH,
        coins: CHECKIN_STREAK_COINS,
        packs: earnReward('checkin_streak').packs,
      },
      placement: PLACEMENT_TIERS.map((tier) => ({
        maxRank: tier.maxRank,
        coins: tier.coins,
        packs: tier.packs,
      })),
      battlenetVerified: {
        coins: BATTLENET_VERIFIED_COINS,
        packs: earnReward('battlenet_verified').packs,
      },
      collectionSet: {
        coins: COLLECTION_SET_COINS,
        packs: earnReward('collection_set').packs,
      },
      matchPrediction: {
        coins: MATCH_PREDICTION_COINS,
        packs: earnReward('match_prediction').packs,
      },
    });
  });

  it('N’ANNONCE PAS le drop quand aucune chaîne n’est branchée', async () => {
    // Une promesse creuse est pire qu'un silence : sans récompense désignée, le
    // webhook répondrait `reward_not_configured` et rembourserait chaque
    // tentative. La page ne doit donc rien promettre.
    seedPools();
    seedPack();
    store.twitch_broadcaster_connections = [] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect('twitchDrop' in res.body.earn).toBe(false);

    // ...MAIS le cadeau d'accueil, lui, reste annoncé. L'asymétrie est
    // VOULUE et mérite d'être défendue : `twitchDrop` promet un gain qui
    // n'aboutirait pas sans chaîne branchée, tandis que `welcomeGift` énonce
    // une règle du barème, vraie indépendamment de Twitch. Sans ce cas,
    // « harmoniser » les deux champs paraîtrait une simplification.
    expect(res.body.earn.welcomeGift).toBe(WELCOME_GIFT_COINS);
  });

  it('annonce le drop dès qu’une récompense est désignée', async () => {
    seedPools();
    seedPack();
    store.twitch_broadcaster_connections = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        broadcaster_id: '1457667837',
        broadcaster_login: 'womens_cup',
        tcg_reward_id: '3e6f723b-3e83-4fb8-910c-1151d28db43f',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    // La constante, jamais sa valeur : le drop est dérivé du gain de scrim.
    expect(res.body.earn.twitchDrop).toBe(TWITCH_DROP_COINS);
  });

  it('reste muet sur le drop si la chaîne est connectée SANS récompense', async () => {
    // Connecter la chaîne ne suffit pas : c'est `tcg_reward_id` qui décide.
    seedPools();
    seedPack();
    store.twitch_broadcaster_connections = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        broadcaster_id: '1457667837',
        broadcaster_login: 'womens_cup',
        tcg_reward_id: null,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect('twitchDrop' in res.body.earn).toBe(false);
  });

  it('rend un solde nul quand aucun porte-monnaie n’existe', async () => {
    // État normal de quelqu'un qui n'a encore rien gagné — pas une erreur.
    seedPools();
    seedPack();
    store.tcg_wallets = [] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(0);
    expect(res.body.unopened).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* POST — l'ouverture, et ce qu'elle laisse voir                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/packs — ouverture', () => {
  it('renvoie les cartes tirées AVEC leur face', async () => {
    // LE point de ce fichier. Sans face, la page ne peut rien montrer de
    // l'ouverture : le tirage se fond dans la collection sans qu'on l'ait vu.
    seedPools();
    seedPack();

    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { packId: PACK } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cards).toHaveLength(PACK_SIZE);

    for (const card of res.body.cards) {
      expect(typeof card.position).toBe('number');
      expect(['player', 'team', 'map']).toContain(card.kind);
      // La face : un nom lisible, pas seulement un identifiant.
      if (card.kind === 'player') {
        expect(card.displayName).toMatch(/^Joueuse \d$/);
      } else if (card.kind === 'map') {
        // La face d'une map vient du REGISTRE, pas de la base : aucune donnée
        // n'a été semée pour elle, et elle doit malgré tout être complète.
        expect(typeof card.name).toBe('string');
        expect(card.imageUrl).toMatch(/^\/img\/maps\/overwatch\/.+\.svg$/);
      } else {
        expect(card.name).toBe('Hinode Sparkles');
        expect(card.slug).toBe('hinode-sparkles');
      }
    }
  });

  it('fige les cartes en base et marque le paquet ouvert', async () => {
    seedPools();
    seedPack();

    await handler(
      makeReq({ method: 'POST', body: { packId: PACK } }),
      makeRes()
    );

    expect((store.tcg_packs?.[0] as any).opened_at).toBeTruthy();
    expect(store.tcg_pack_cards ?? []).toHaveLength(PACK_SIZE);
  });

  it('refuse d’ouvrir deux fois le même paquet', async () => {
    // Réservation atomique : le second appel ne doit pas distribuer un second
    // lot de cartes pour un paquet unique.
    seedPools();
    seedPack();

    await handler(
      makeReq({ method: 'POST', body: { packId: PACK } }),
      makeRes()
    );
    const res2 = makeRes();
    await handler(makeReq({ method: 'POST', body: { packId: PACK } }), res2);

    expect(res2.statusCode).toBe(409);
    expect(res2.body.code).toBe('already_opened');
    // Et surtout : pas de cartes en double.
    expect(store.tcg_pack_cards ?? []).toHaveLength(PACK_SIZE);
  });

  it('ouvre un paquet de maps quand aucune joueuse ni équipe n’existe', async () => {
    // CE CONTRAT A CHANGÉ avec l'arrivée des cartes de map, et ce test dit le
    // nouveau plutôt que d'épingler l'ancien.
    //
    // AVANT : les deux viviers venaient de la base ; tous deux vides valaient
    // `409 empty_pool`, et le paquet restait fermé pour ne pas être perdu.
    // MAINTENANT : le vivier des maps est un registre EN MÉMOIRE, jamais vide.
    // Un tenant sans aucune joueuse ni équipe classée reçoit donc un paquet
    // complet de maps. C'est le comportement voulu — un paquet non vide vaut
    // mieux qu'un paquet refusé — mais il rend `empty_pool` inatteignable par
    // cette voie, ce que dit aussi le commentaire de la route.
    store.player_ratings = [] as any;
    store.teams = [] as any;
    seedPack();

    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { packId: PACK } }), res);

    expect(res.statusCode).toBe(200);
    // Le paquet reste COMPLET : l'emplacement de map, puis quatre maps de
    // comblement — les viviers absents ne l'amputent pas.
    expect(res.body.cards).toHaveLength(PACK_SIZE);
    expect(
      res.body.cards.every((c: { kind: string }) => c.kind === 'map')
    ).toBe(true);
    // Et le paquet est bien consommé, puisqu'il a distribué quelque chose.
    expect((store.tcg_packs?.[0] as any).opened_at).toBeTruthy();
  });

  it('ne confirme pas l’existence d’un paquet qui n’est pas le sien', async () => {
    seedPools();
    store.tcg_packs = [
      {
        id: PACK,
        tenant_id: DEFAULT_TENANT_ID,
        user_id: '99999999-9999-4999-8999-999999999999',
        source_kind: 'victory',
        granted_at: '2026-01-01T00:00:00.000Z',
        opened_at: null,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ method: 'POST', body: { packId: PACK } }), res);

    // 404 et non 403 : un 403 confirmerait que ce paquet existe.
    expect(res.statusCode).toBe(404);
  });
});
