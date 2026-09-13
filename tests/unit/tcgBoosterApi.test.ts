// tests/unit/tcgBoosterApi.test.ts
//
// POST /api/player/tcg/booster — la seule route du TCG qui DÉBITE.
//
// CE QUE CES CAS PROTÈGENT, ET POURQUOI ÇA SE PERD FACILEMENT.
//
//   1. LE BARÈME VIENT DE `utils/tcg/economy.ts`. Aucun montant n'est écrit en
//      dur ici : un test qui poserait « 300 » figerait un prix que le code
//      laisse réglable, et le premier ajustement du barème casserait la suite
//      au lieu de la valider.
//
//   2. LE DÉBIT EST CONDITIONNEL, PAS « LIRE PUIS ÉCRIRE ». Deux achats
//      simultanés liraient le même solde et le dépenseraient deux fois. La
//      contrainte d'unicité du registre ne protège pas de ce cas (chaque achat
//      a sa propre référence) : la seule garantie est le `.eq('balance', avant)`
//      de l'écriture. Elle est invisible à la lecture du code — rien ne signale
//      qu'enlever ce filtre « qui ne sert à rien » ouvre la double dépense.
//
//   3. UNE ÉCRITURE DE REGISTRE RATÉE ANNULE L'ACHAT. C'est le cas le plus
//      important du fichier. Sans la suppression du paquet, l'étape suivante
//      recalculerait le solde depuis un registre NON débité et rendrait les
//      pièces : la joueuse garderait un booster GRATUIT à chaque erreur
//      transitoire. Une régression ici ne casse rien de visible — elle offre
//      simplement des boosters.
//
//   4. LE SOLDE EST UN CACHE DU REGISTRE. On sème donc des écritures cohérentes
//      avec le solde affiché, sinon on testerait un état que la production ne
//      produit jamais.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { BOOSTER_PRICE_COINS, MATCH_WIN_COINS } from '../../utils/tcg/economy';

import handler from '../../pages/api/player/tcg/booster';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let _token = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _token += 1;
  return {
    method: 'POST',
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
 * Sème un porte-monnaie COHÉRENT : `wins` victoires au registre, et un solde
 * qui en est exactement la somme.
 *
 * Semer un solde sans les écritures qui le justifient donnerait un état
 * impossible en production — et le `refreshBalance` de fin d'achat, qui
 * recalcule depuis le registre, remettrait le solde à zéro en faisant croire à
 * un bug de la route.
 */
function seedWallet(wins: number, tenantId: string = DEFAULT_TENANT_ID) {
  store.tcg_wallet_entries = Array.from({ length: wins }, (_, i) => ({
    id: `entry-${i}`,
    tenant_id: tenantId,
    user_id: PLAYER,
    amount: MATCH_WIN_COINS,
    source_kind: 'match_win',
    source_ref: `match-${i}`,
    created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
  })) as any;

  store.tcg_wallets = [
    {
      tenant_id: tenantId,
      user_id: PLAYER,
      balance: wins * MATCH_WIN_COINS,
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
}

/** Nombre de victoires nécessaires pour s'offrir un booster (barème dérivé). */
const WINS_FOR_ONE_BOOSTER = Math.ceil(BOOSTER_PRICE_COINS / MATCH_WIN_COINS);

/**
 * Le mock Supabase ne sait pas échouer. On enveloppe donc `from()` pour forcer
 * l'erreur d'UNE opération sur UNE table, en laissant tout le reste réel : le
 * repli qu'on teste (suppression du paquet, recalcul du solde) doit lui
 * continuer de fonctionner, sinon on ne testerait que le mock.
 */
function failOn(
  table: string,
  op: 'insert' | 'delete',
  shape: 'plain' | 'selectMaybeSingle' = 'plain',
  message = 'échec transitoire'
) {
  const real = supabaseAdmin.from.bind(supabaseAdmin);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((name: string) => {
    const builder: any = real(name);
    if (name === table) {
      if (shape === 'selectMaybeSingle') {
        // `.insert(...).select('id').maybeSingle()`
        builder[op] = () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { message } }),
          }),
        });
      } else {
        // `.insert(...)` / `.delete().eq()...` attendus directement
        builder[op] = () => {
          const chain: any = {
            eq: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: { message } }).then(resolve),
          };
          return chain;
        };
      }
    }
    return builder;
  });
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: PLAYER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Refus d'achat — rien ne doit être écrit                                     */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/booster — refus', () => {
  it('refuse une méthode non autorisée', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('refuse un solde insuffisant sans RIEN écrire', async () => {
    // Le point n'est pas le 400, c'est l'absence d'écriture : un refus qui
    // aurait quand même créé le paquet donnerait un booster gratuit à qui n'a
    // pas les moyens de l'acheter.
    seedWallet(WINS_FOR_ONE_BOOSTER - 1);
    const before = (store.tcg_wallets![0] as any).balance;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('insufficient_funds');
    // Le barème est rendu à l'appelante pour qu'elle sache ce qui manque.
    expect(res.body.price).toBe(BOOSTER_PRICE_COINS);
    expect(res.body.balance).toBe(before);

    expect(store.tcg_packs ?? []).toHaveLength(0);
    expect(store.tcg_wallet_entries).toHaveLength(WINS_FOR_ONE_BOOSTER - 1);
    expect((store.tcg_wallets![0] as any).balance).toBe(before);
  });

  it('traite l’absence de porte-monnaie comme un solde nul, pas une erreur', async () => {
    // État normal de quelqu'un qui n'a encore rien gagné.
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('insufficient_funds');
    expect(res.body.balance).toBe(0);
    expect(store.tcg_packs ?? []).toHaveLength(0);
  });

  it('ne laisse pas dépenser les pièces d’un AUTRE tenant', async () => {
    // Une joueuse peut jouer dans plusieurs organisations ; son porte-monnaie
    // est celui du tenant courant. Sans scoping, les pièces gagnées ailleurs
    // paieraient les boosters d'ici.
    seedWallet(WINS_FOR_ONE_BOOSTER * 3, OTHER_TENANT);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('insufficient_funds');
    expect(res.body.balance).toBe(0);
    expect(store.tcg_packs ?? []).toHaveLength(0);
    // Et le porte-monnaie de l'autre tenant n'a pas bougé d'un centime.
    expect((store.tcg_wallets![0] as any).balance).toBe(
      WINS_FOR_ONE_BOOSTER * 3 * MATCH_WIN_COINS
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Achat réussi — un paquet FERMÉ, une écriture au registre                     */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/booster — achat', () => {
  it('crée un paquet FERMÉ, débite le registre et recalcule le solde', async () => {
    const wins = WINS_FOR_ONE_BOOSTER + 1;
    seedWallet(wins);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.price).toBe(BOOSTER_PRICE_COINS);
    expect(typeof res.body.packId).toBe('string');

    // Le paquet : fermé, et marqué comme ACHETÉ. `source_match_id` NULL +
    // `source_kind = 'purchase'` sont exigés ensemble par la contrainte de
    // cohérence du schéma — un achat étiqueté 'victory' passerait ici mais
    // serait rejeté en base.
    expect(store.tcg_packs).toHaveLength(1);
    const pack = store.tcg_packs![0] as any;
    expect(pack.id).toBe(res.body.packId);
    expect(pack.source_kind).toBe('purchase');
    expect(pack.source_match_id).toBeNull();
    expect(pack.tenant_id).toBe(DEFAULT_TENANT_ID);
    expect(pack.user_id).toBe(PLAYER);
    // Fermé : l'achat ne tire aucune carte, l'ouverture est un autre geste.
    // C'est ce qui permet de rejouer une ouverture ratée sans re-débiter.
    expect(pack.opened_at ?? null).toBeNull();

    // L'écriture au registre : négative, du bon montant, et rattachée AU
    // PAQUET — c'est `source_ref` qui rend la dépense traçable.
    const spends = (store.tcg_wallet_entries as any[]).filter(
      (e) => e.source_kind === 'booster_purchase'
    );
    expect(spends).toHaveLength(1);
    expect(spends[0].amount).toBe(-BOOSTER_PRICE_COINS);
    expect(spends[0].source_ref).toBe(res.body.packId);
    expect(spends[0].tenant_id).toBe(DEFAULT_TENANT_ID);
    expect(spends[0].user_id).toBe(PLAYER);

    // Le solde n'est pas décrémenté « à la main » : il est recalculé depuis le
    // registre, seule source de vérité.
    expect((store.tcg_wallets![0] as any).balance).toBe(
      wins * MATCH_WIN_COINS - BOOSTER_PRICE_COINS
    );
  });

  it('autorise l’achat au centime près (solde EXACTEMENT égal au prix)', async () => {
    // La borne : `canAfford` compare avec `>=`. Un `>` transformerait le
    // dernier achat possible en refus incompréhensible.
    seedWallet(WINS_FOR_ONE_BOOSTER);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect((store.tcg_wallets![0] as any).balance).toBe(
      WINS_FOR_ONE_BOOSTER * MATCH_WIN_COINS - BOOSTER_PRICE_COINS
    );
  });

  it('débite une fois par achat, pas une fois pour deux', async () => {
    // Deux achats SÉQUENTIELS avec de quoi payer les deux : chacun laisse sa
    // trace, et le solde final porte les deux débits.
    const wins = WINS_FOR_ONE_BOOSTER * 2;
    seedWallet(wins);

    await handler(makeReq(), makeRes());
    const res2 = makeRes();
    await handler(makeReq(), res2);

    expect(res2.statusCode).toBe(200);
    expect(store.tcg_packs).toHaveLength(2);
    const spends = (store.tcg_wallet_entries as any[]).filter(
      (e) => e.source_kind === 'booster_purchase'
    );
    expect(spends).toHaveLength(2);
    // Deux paquets distincts : le registre ne doit pas référencer deux fois le
    // même, sinon la contrainte d'unicité rejetterait le second achat en base.
    expect(new Set(spends.map((e) => e.source_ref)).size).toBe(2);
    expect((store.tcg_wallets![0] as any).balance).toBe(
      wins * MATCH_WIN_COINS - 2 * BOOSTER_PRICE_COINS
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Double dépense — l'écriture conditionnelle                                  */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/booster — dépense concurrente', () => {
  it('refuse en 409 si le solde a changé entre la lecture et l’écriture', async () => {
    // LE cas que le `.eq('balance', avant)` existe pour attraper. On simule
    // l'achat concurrent en modifiant le solde JUSTE APRÈS sa lecture par le
    // handler : c'est exactement la fenêtre que deux requêtes parallèles
    // ouvrent. Sans le filtre, le handler écrirait « ancien - prix » et
    // effacerait la dépense de l'autre — un booster livré à crédit.
    seedWallet(WINS_FOR_ONE_BOOSTER);

    const real = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((name: string) => {
      const builder: any = real(name);
      if (name === 'tcg_wallets') {
        const originalMaybeSingle = builder.maybeSingle.bind(builder);
        builder.maybeSingle = async () => {
          const result = await originalMaybeSingle();
          // Un autre achat passe ICI, entre la lecture et l'écriture.
          (store.tcg_wallets![0] as any).balance = 0;
          return result;
        };
      }
      return builder;
    });

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_changed');
    // Et surtout : RIEN n'a été livré.
    expect(store.tcg_packs ?? []).toHaveLength(0);
    expect(
      (store.tcg_wallet_entries as any[]).filter(
        (e) => e.source_kind === 'booster_purchase'
      )
    ).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Annulation — le cas qui distribue des boosters gratuits si on le casse      */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/booster — annulation', () => {
  it('SUPPRIME le paquet quand l’écriture au registre échoue', async () => {
    // Le cas le plus important du fichier. Sans la suppression, le recalcul du
    // solde depuis un registre non débité rendrait les pièces ET laisserait le
    // paquet : un booster gratuit à chaque erreur transitoire.
    const wins = WINS_FOR_ONE_BOOSTER + 1;
    seedWallet(wins);
    failOn('tcg_wallet_entries', 'insert');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    // Ni paquet livré…
    expect(store.tcg_packs ?? []).toHaveLength(0);
    // …ni écriture de dépense…
    expect(
      (store.tcg_wallet_entries as any[]).filter(
        (e) => e.source_kind === 'booster_purchase'
      )
    ).toHaveLength(0);
    // …ni pièces prélevées : le solde est revenu exactement là où il était.
    expect((store.tcg_wallets![0] as any).balance).toBe(wins * MATCH_WIN_COINS);
  });

  it('rend les pièces quand le paquet n’a pas pu être créé après le débit', async () => {
    // Le débit a eu lieu dans le cache, mais le registre n'a rien enregistré :
    // recalculer depuis le registre suffit à rendre les pièces.
    const wins = WINS_FOR_ONE_BOOSTER + 1;
    seedWallet(wins);
    failOn('tcg_packs', 'insert', 'selectMaybeSingle');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    expect(store.tcg_packs ?? []).toHaveLength(0);
    expect((store.tcg_wallets![0] as any).balance).toBe(wins * MATCH_WIN_COINS);
  });

  it('rend les pièces même si le paquet orphelin n’a pas pu être supprimé', async () => {
    // Le seul état incohérent assumé : un paquet offert, jamais facturé. La
    // garantie qui doit tenir malgré tout est monétaire — on ne prélève pas des
    // pièces pour un achat qu'on vient d'annoncer en échec.
    const wins = WINS_FOR_ONE_BOOSTER + 1;
    seedWallet(wins);

    const real = supabaseAdmin.from.bind(supabaseAdmin);
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((name: string) => {
      const builder: any = real(name);
      if (name === 'tcg_wallet_entries') {
        builder.insert = () =>
          Promise.resolve({ data: null, error: { message: 'registre KO' } });
      }
      if (name === 'tcg_packs') {
        builder.delete = () => {
          const chain: any = {
            eq: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({
                data: null,
                error: { message: 'suppression KO' },
              }).then(resolve),
          };
          return chain;
        };
      }
      return builder;
    });

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    // Le paquet orphelin subsiste (c'est le cas dégradé documenté)…
    expect(store.tcg_packs).toHaveLength(1);
    // …mais la joueuse n'a pas payé.
    expect((store.tcg_wallets![0] as any).balance).toBe(wins * MATCH_WIN_COINS);
  });
});
