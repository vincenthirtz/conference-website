// tests/unit/adminTcgOverview.test.ts
//
// L'ÉTAT DE L'ÉCONOMIE DU TCG, épinglé.
//
// CE QUE CES TESTS PROTÈGENT VRAIMENT. Un tableau de bord d'économie n'échoue
// pas bruyamment : il affiche un nombre. Trois façons d'afficher un nombre faux
// sans que rien ne casse, une par groupe de cas :
//
//   1. LE RECYCLAGE. `recycled_at` marque une carte revendue sans supprimer sa
//      ligne. Un comptage qui oublie le filtre rend une collection qui ne
//      décroît jamais — et la revente massive, précisément le signal de dérive
//      qu'on cherche, devient invisible.
//   2. LA PORTÉE TENANT. `tcg_pack_cards` N'A PAS de colonne `tenant_id` : elle
//      est cadrée par son paquet. Un `.select()` direct compterait les cartes
//      de tous les tenants et personne ne le verrait, les chiffres restant
//      plausibles. D'où un jeu de données à DEUX tenants.
//   3. `null` CONTRE `0`. Une lecture en échec doit dire « inconnu », pas
//      « zéro ». Un `0` inventé se lit comme un effondrement de l'économie.
//
// CE FICHIER NE DÉPEND QUE DE L'ENDPOINT, DÉLIBÉRÉMENT. Une version antérieure
// faisait passer la réponse dans la normalisation de
// `components/admin/tcg/TcgOverviewPanel.tsx` pour épingler le contrat
// producteur ↔ consommateur. L'idée reste bonne — c'est le seul endroit où un
// renommage de clé se voit, la normalisation du panneau étant défensive (une
// clé inconnue n'y produit ni exception ni log, juste un « — »). Mais ce
// composant était en cours de réécriture pendant que ce test s'écrivait, et
// coupler la suite d'un endpoint à un fichier qui change sous elle rend le
// typecheck non déterministe. Le garde-fou doit exister : sa place est dans le
// test du panneau, à côté du code qui lit ces clés.
//
// Les assertions portent sur la réponse HTTP réelle, pas sur des fonctions
// internes : c'est cette forme-là que le panneau consomme.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { BOOSTER_PRICE_COINS } from '../../utils/tcg/economy';

import overviewHandler from '../../pages/api/admin/tcg/overview';

const TENANT = CONFERENCE_TENANT_ID;
/** Un second tenant : la portée est vérifiée par contraste, pas par confiance. */
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';

const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

const PLAYER_A = '11111111-1111-4111-8111-111111111111';
const PLAYER_B = '22222222-2222-4222-8222-222222222222';
const PLAYER_C = '33333333-3333-4333-8333-333333333333';
const PLAYER_D = '44444444-4444-4444-8444-444444444444';
const PLAYER_E = '77777777-7777-4777-8777-777777777777';
const TEAM_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/* -------------------------------------------------------------------------- */
/* Doublures HTTP                                                              */
/* -------------------------------------------------------------------------- */

let _token = 0;
function freshBearer() {
  _token += 1;
  return `Bearer t-${Date.now()}-${_token}`;
}

function makeReq(
  over: Partial<Record<string, unknown>> = {},
  auth = true
): any {
  const headers: Record<string, string> = { host: 'h' };
  if (auth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Le staff qui ouvre le panneau TCG (`moderate_support`). */
function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ROW, role, created_at: '2026-01-01' },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

async function callOverview(query: Record<string, unknown> = {}) {
  const res = makeRes();
  await overviewHandler(makeReq({ query }), res);
  return res;
}

/* -------------------------------------------------------------------------- */
/* Jeu de données                                                              */
/* -------------------------------------------------------------------------- */

const P_OPEN_VICTORY = 'p1111111-1111-4111-8111-111111111111';
const P_SEALED = 'p2222222-2222-4222-8222-222222222222';
const P_OPEN_PURCHASE = 'p3333333-3333-4333-8333-333333333333';
const P_OTHER_TENANT = 'p9999999-9999-4999-8999-999999999999';

function card(over: Record<string, unknown>) {
  return {
    pack_id: P_OPEN_VICTORY,
    position: 0,
    subject_kind: 'player',
    card_user_id: PLAYER_A,
    card_team_id: null,
    rarity: 'common',
    is_foil: false,
    recycled_at: null,
    ...over,
  };
}

/**
 * Deux tenants, chaque situation représentée une fois : paquet ouvert / scellé,
 * gagné / acheté, carte active / recyclée, joueuse / équipe, solde nul /
 * positif, photo en attente / approuvée / refusée, accord donné / retiré.
 */
function seedEconomy() {
  store.tcg_packs = [
    {
      id: P_OPEN_VICTORY,
      tenant_id: TENANT,
      user_id: PLAYER_A,
      source_kind: 'victory',
      source_match_id: 'm-1',
      opened_at: '2026-02-01T00:00:00.000Z',
    },
    {
      id: P_SEALED,
      tenant_id: TENANT,
      user_id: PLAYER_B,
      source_kind: 'victory',
      source_match_id: 'm-2',
      opened_at: null,
    },
    {
      id: P_OPEN_PURCHASE,
      tenant_id: TENANT,
      user_id: PLAYER_B,
      source_kind: 'purchase',
      source_match_id: null,
      opened_at: '2026-02-03T00:00:00.000Z',
    },
    // Autre tenant : ne doit apparaître dans AUCUN compteur.
    {
      id: P_OTHER_TENANT,
      tenant_id: OTHER_TENANT,
      user_id: PLAYER_C,
      source_kind: 'victory',
      source_match_id: 'm-9',
      opened_at: '2026-02-04T00:00:00.000Z',
    },
  ] as any;

  store.tcg_pack_cards = [
    // Paquet gagné : deux exemplaires de PLAYER_A (dont un brillant) + une
    // carte d'équipe.
    card({ position: 0, rarity: 'common' }),
    card({ position: 1, rarity: 'rare', is_foil: true }),
    card({
      position: 2,
      subject_kind: 'team',
      card_user_id: null,
      card_team_id: TEAM_1,
      rarity: 'epic',
    }),
    // Paquet acheté : une légendaire, et un doublon DÉJÀ RECYCLÉ.
    card({
      pack_id: P_OPEN_PURCHASE,
      position: 0,
      card_user_id: PLAYER_B,
      rarity: 'legendary',
    }),
    card({
      pack_id: P_OPEN_PURCHASE,
      position: 1,
      rarity: 'common',
      recycled_at: '2026-02-05T00:00:00.000Z',
    }),
    // Cartes d'un paquet d'un AUTRE tenant : `tcg_pack_cards` n'ayant pas de
    // `tenant_id`, seul le cadrage par `pack_id` les exclut.
    card({
      pack_id: P_OTHER_TENANT,
      position: 0,
      card_user_id: PLAYER_C,
      rarity: 'legendary',
      is_foil: true,
    }),
    card({ pack_id: P_OTHER_TENANT, position: 1, rarity: 'epic' }),
  ] as any;

  store.tcg_wallets = [
    { tenant_id: TENANT, user_id: PLAYER_A, balance: 250 },
    // Solde nul : c'est un compte, pas un détenteur de pièces.
    { tenant_id: TENANT, user_id: PLAYER_B, balance: 0 },
    { tenant_id: OTHER_TENANT, user_id: PLAYER_C, balance: 9999 },
  ] as any;

  store.tcg_wallet_entries = [
    {
      tenant_id: TENANT,
      user_id: PLAYER_A,
      amount: 100,
      source_kind: 'match_win',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_A,
      amount: 100,
      source_kind: 'match_win',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_A,
      amount: 50,
      source_kind: 'card_recycled',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_B,
      amount: -300,
      source_kind: 'booster_purchase',
    },
    {
      tenant_id: OTHER_TENANT,
      user_id: PLAYER_C,
      amount: 7777,
      source_kind: 'match_win',
    },
  ] as any;

  store.tcg_player_cards = [
    {
      tenant_id: TENANT,
      user_id: PLAYER_A,
      opted_in_at: '2026-01-01T00:00:00.000Z',
      revoked_at: null,
      photo_status: 'approved',
      photo_path: 'tcg/a.png',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_B,
      opted_in_at: '2026-01-02T00:00:00.000Z',
      revoked_at: null,
      photo_status: 'pending',
      photo_path: 'tcg/b.png',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_D,
      opted_in_at: '2026-01-03T00:00:00.000Z',
      revoked_at: null,
      photo_status: 'pending',
      photo_path: 'tcg/d.png',
    },
    // Photo REFUSÉE : la joueuse garde son accord, c'est le cliché qui a été
    // écarté. Elle compte donc parmi les accords en cours, jamais parmi les
    // retraits.
    {
      tenant_id: TENANT,
      user_id: PLAYER_E,
      opted_in_at: '2026-01-05T00:00:00.000Z',
      revoked_at: null,
      photo_status: 'rejected',
      photo_path: null,
    },
    // Accord RETIRÉ : ni un refus, ni un accord en cours.
    {
      tenant_id: TENANT,
      user_id: PLAYER_C,
      opted_in_at: '2026-01-04T00:00:00.000Z',
      revoked_at: '2026-02-01T00:00:00.000Z',
      photo_status: 'none',
      photo_path: null,
    },
    {
      tenant_id: OTHER_TENANT,
      user_id: PLAYER_C,
      opted_in_at: '2026-01-06T00:00:00.000Z',
      revoked_at: null,
      photo_status: 'pending',
      photo_path: 'tcg/other.png',
    },
  ] as any;

  store.player_ratings = [
    {
      tenant_id: TENANT,
      user_id: PLAYER_A,
      display_name: 'Nova',
      avatar_url: 'https://cdn.test/nova.png',
    },
    {
      tenant_id: TENANT,
      user_id: PLAYER_B,
      display_name: 'Echo',
      avatar_url: null,
    },
  ] as any;

  store.teams = [
    {
      id: TEAM_1,
      tenant_id: TENANT,
      name: 'Les Renardes',
      short_name: 'REN',
      slug: 'les-renardes',
      logo_url: '/img/teams-images/renardes.png',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -------------------------------------------------------------------------- */
/* La porte                                                                    */
/* -------------------------------------------------------------------------- */

describe('GET /api/admin/tcg/overview — accès', () => {
  it('401 sans jeton', async () => {
    const res = makeRes();
    await overviewHandler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 pour un rôle sans `moderate_support`', async () => {
    // Le caster n'a que la régie : l'agrégat dit qui possède quoi, il n'a rien
    // à en faire.
    seedStaff('caster');
    const res = await callOverview();
    expect(res.statusCode).toBe(403);
  });

  it('405 hors GET, avec l’en-tête Allow', async () => {
    seedStaff();
    const res = makeRes();
    await overviewHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

/* -------------------------------------------------------------------------- */
/* L'entrée                                                                    */
/* -------------------------------------------------------------------------- */

describe('GET /api/admin/tcg/overview — paramètre `top`', () => {
  it('refuse une borne hors barème plutôt que de la subir', async () => {
    // Sans borne haute, `?top=100000` dicterait la taille de la réponse ET le
    // nombre de faces à résoudre.
    seedStaff();
    seedEconomy();

    const res = await callOverview({ top: '100000' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  it('refuse une valeur non numérique', async () => {
    seedStaff();
    const res = await callOverview({ top: 'beaucoup' });
    expect(res.statusCode).toBe(400);
  });

  it('tronque la liste à la borne demandée', async () => {
    seedStaff();
    seedEconomy();

    const res = await callOverview({ top: '1' });

    expect(res.statusCode).toBe(200);
    expect(res.body.topSubjects).toHaveLength(1);
    // Le plus distribué d'abord.
    expect(res.body.topSubjects[0].userId).toBe(PLAYER_A);
  });
});

/* -------------------------------------------------------------------------- */
/* Les chiffres                                                                */
/* -------------------------------------------------------------------------- */

describe('GET /api/admin/tcg/overview — agrégation', () => {
  it('rend des zéros, pas des `null`, quand tout est vide', async () => {
    // La distinction est le contrat de cet endpoint : `0` = mesuré et vide.
    seedStaff();

    const res = await callOverview();

    expect(res.statusCode).toBe(200);
    expect(res.body.packs).toEqual({
      granted: 0,
      opened: 0,
      pending: 0,
      bySource: {
        victory: 0,
        purchase: 0,
        welcome: 0,
        drop: 0,
        placement: 0,
        streak: 0,
      },
    });
    expect(res.body.cards).toEqual({
      total: 0,
      foil: 0,
      byRarity: { common: 0, rare: 0, epic: 0, legendary: 0 },
      recycled: 0,
      drawn: 0,
      truncated: false,
    });
    expect(res.body.coins).toEqual({
      inCirculation: 0,
      earned: 0,
      // `{}` et non `null` : le registre a été LU, il ne contient simplement
      // aucun crédit. C'est la même distinction que `0` vs `null` ailleurs.
      earnedBySource: {},
      spent: 0,
      wallets: 0,
      boosterPrice: BOOSTER_PRICE_COINS,
      truncated: false,
    });
    expect(res.body.photos).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      optedIn: 0,
      revoked: 0,
    });
    expect(res.body.topSubjects).toEqual([]);
  });

  it('compte les paquets par état et par origine', async () => {
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    expect(res.statusCode).toBe(200);
    // 3 paquets du tenant (le 4e appartient à l'autre tenant).
    expect(res.body.packs).toEqual({
      granted: 3,
      opened: 2,
      pending: 1,
      bySource: {
        victory: 2,
        purchase: 1,
        welcome: 0,
        drop: 0,
        placement: 0,
        streak: 0,
      },
    });
  });

  it('ventile les gains par origine, sans y mêler les dépenses', async () => {
    // `earned` dit COMBIEN, jamais D'OÙ — et c'est la question qu'on se pose en
    // surveillant une économie. Les drops en direct n'apparaissaient nulle part
    // ailleurs : ils ne créent aucun paquet, donc la ventilation des paquets ne
    // pouvait pas les montrer.
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    expect(res.statusCode).toBe(200);
    // Deux victoires à 100 et un recyclage à 50. L'achat de booster (−300) est
    // un DÉBIT : il reste dans `spent` et n'a rien à faire dans les origines de
    // gain, sinon acheter passerait pour une façon d'obtenir des pièces.
    expect(res.body.coins.earnedBySource).toEqual({
      match_win: 200,
      card_recycled: 50,
    });
    // La ventilation totalise exactement `earned` : un écart se lirait comme
    // une perte inexpliquée.
    const ventilated = Object.values(
      res.body.coins.earnedBySource as Record<string, number>
    ).reduce((sum, n) => sum + n, 0);
    expect(ventilated).toBe(res.body.coins.earned);
    // L'autre tenant (7777 en `match_win`) ne doit apparaître nulle part.
    expect(res.body.coins.earned).toBe(250);
  });

  it('exclut les cartes recyclées des possédées, et les compte à part', async () => {
    // LE point de cette suite. Une carte recyclée a été vendue : la compter
    // comme possédée reviendrait à la garder ET à l'avoir vendue.
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    const cards = res.body.cards;
    expect(cards.total).toBe(4); // encore possédées
    expect(cards.drawn).toBe(5); // jamais tirées, recyclée comprise
    expect(cards.recycled).toBe(1);
    // La recyclée était `common` : elle ne doit pas gonfler la répartition.
    expect(cards.byRarity).toEqual({
      common: 1,
      rare: 1,
      epic: 1,
      legendary: 1,
    });
    expect(cards.foil).toBe(1);
    expect(cards.truncated).toBe(false);
  });

  it('somme les pièces sans compter les soldes nuls comme détenteurs', async () => {
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    expect(res.body.coins.inCirculation).toBe(250);
    expect(res.body.coins.wallets).toBe(1);
    // Crédits : 100 + 100 + 50. Débits : 300, rendus en valeur absolue — un
    // « -300 dépensées » se lit deux fois avant d'être compris.
    expect(res.body.coins.earned).toBe(250);
    expect(res.body.coins.spent).toBe(300);
    expect(res.body.coins.boosterPrice).toBe(BOOSTER_PRICE_COINS);
  });

  it('ne confond pas une photo refusée avec un accord retiré', async () => {
    // Deux faits différents : dans un cas la modération a écarté un cliché,
    // dans l'autre la joueuse a repris son accord. PLAYER_E, refusée, garde
    // son accord ; PLAYER_C, retirée, n'en a plus.
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    expect(res.body.photos).toEqual({
      pending: 2,
      approved: 1,
      rejected: 1,
      optedIn: 4,
      revoked: 1,
    });
  });

  it('nomme les sujets les plus distribués, du plus au moins fréquent', async () => {
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    const top = res.body.topSubjects;
    expect(top[0]).toEqual({
      kind: 'player',
      userId: PLAYER_A,
      name: 'Nova',
      // Photo TCG approuvée : c'est elle que rend `readCardFaces`.
      imageUrl: expect.stringContaining('tcg/a.png'),
      count: 2, // l'exemplaire recyclé n'en fait plus partie
      foilCount: 1,
    });

    const team = top.find((s: any) => s.kind === 'team');
    expect(team).toEqual({
      kind: 'team',
      teamId: TEAM_1,
      // Le slug, sans quoi aucun lien honnête vers l'équipe n'est possible :
      // son uuid ne route nulle part.
      slug: 'les-renardes',
      name: 'Les Renardes',
      imageUrl: '/img/teams-images/renardes.png',
      count: 1,
      foilCount: 0,
    });

    // Les comptes décroissent : c'est ce qui fait de la liste un classement.
    const counts = top.map((s: any) => s.count);
    expect([...counts].sort((a: number, b: number) => b - a)).toEqual(counts);
  });

  it('ne sert pas la photo d’une joueuse dont l’accord a été retiré', async () => {
    // Le panneau staff passe par `readCardFaces` : le filtre de consentement
    // vaut ici comme sur la fiche publique. Lire `tcg_player_cards` en direct
    // pour gagner une requête le contournerait en silence.
    seedStaff();
    seedEconomy();
    (store.tcg_player_cards as any[])[0].revoked_at =
      '2026-03-01T00:00:00.000Z';

    const res = await callOverview();

    const nova = res.body.topSubjects.find((s: any) => s.userId === PLAYER_A);
    expect(nova.imageUrl).not.toContain('tcg/a.png');
    // Repli sur l'avatar public, que la joueuse a elle-même choisi.
    expect(nova.imageUrl).toBe('https://cdn.test/nova.png');
  });
});

/* -------------------------------------------------------------------------- */
/* La portée tenant                                                            */
/* -------------------------------------------------------------------------- */

describe('GET /api/admin/tcg/overview — portée tenant', () => {
  it('ignore entièrement l’économie d’un autre tenant', async () => {
    // `tcg_pack_cards` n'a PAS de `tenant_id` : seul le cadrage par les
    // identifiants de paquets du tenant l'exclut. Sans lui, les chiffres
    // restent plausibles — donc invérifiables à l'œil.
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    // L'autre tenant apportait 2 cartes (dont une légendaire brillante),
    // 9999 pièces, 7777 crédités, 1 photo en attente et 1 paquet ouvert.
    expect(res.body.cards.drawn).toBe(5);
    expect(res.body.cards.foil).toBe(1);
    expect(res.body.coins.inCirculation).toBe(250);
    expect(res.body.coins.earned).toBe(250);
    expect(res.body.photos.pending).toBe(2);
    expect(res.body.packs.granted).toBe(3);
    // PLAYER_C n'est distribué que chez l'autre tenant.
    expect(
      res.body.topSubjects.some((s: any) => (s.userId ?? s.teamId) === PLAYER_C)
    ).toBe(false);
  });

  it('n’expose aucune ligne de détail, seulement des agrégats', async () => {
    // Le panneau reçoit des nombres. Un jour où quelqu'un ajoutera « la liste
    // des derniers paquets », ce sera une décision, pas une fuite.
    seedStaff();
    seedEconomy();

    const res = await callOverview();

    expect(Object.keys(res.body).sort()).toEqual([
      'cards',
      'coins',
      'generatedAt',
      'packs',
      'photos',
      'topSubjects',
    ]);
  });
});
