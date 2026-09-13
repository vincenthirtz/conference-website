// tests/unit/tcgCollectionApi.test.ts
//
// `/api/player/tcg/collection` — la seule vue d'ensemble qu'une joueuse a de
// ses cartes, et elle n'avait aucun test.
//
// CETTE ROUTE PORTE DEUX GARANTIES QUI NE SE VOIENT PAS DANS SA SIGNATURE.
//
//   1. LA COLLECTION SE DÉDUIT, ELLE N'EST PAS STOCKÉE. Aucune table d'agrégat :
//      le contenu est recalculé à chaque appel depuis les paquets OUVERTS et
//      leurs cartes. Tout ce que les cas ci-dessous vérifient — regroupement par
//      sujet, meilleure rareté possédée, exclusion des paquets fermés et des
//      cartes recyclées — vit donc dans une trentaine de lignes d'agrégation
//      côté serveur, que rien d'autre ne contraint. Ajouter une table
//      `collection` un jour « pour aller plus vite » devrait faire tomber ces
//      tests : c'est leur second rôle.
//
//   2. LA FACE EST RELUE À CHAQUE APPEL, JAMAIS FIGÉE AU TIRAGE. C'est
//      l'unique mécanisme qui rend le retrait de consentement RÉTROACTIF sur
//      les cartes déjà distribuées. `tcgPhotoConsent.test.ts` vérifie ce filtre
//      au niveau du lecteur `readPlayerFaces` ; ici on le vérifie LÀ OÙ UN TIERS
//      REGARDE VRAIMENT — dans la collection de quelqu'un d'autre. Les deux
//      angles comptent : une optimisation qui figerait l'URL de la photo dans
//      `tcg_pack_cards` laisserait `tcgPhotoConsent` au vert et casserait
//      pourtant la promesse faite aux joueuses.
//
// POINT D'ATTENTION — `recycled_at`. La colonne est récente (migration
// `tcg_recycle_duplicates.sql`). Une carte revendue GARDE sa ligne, pour que le
// crédit correspondant reste explicable, et doit disparaître de la collection.
// Sans ce filtre on pourrait vendre une carte ET la garder. La migration
// désigne nommément deux lecteurs à tenir à jour ; celui-ci en est un.

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

import handler from '../../pages/api/player/tcg/collection';

// UUID BIEN FORMÉS (nibbles de version/variante RFC 4122). Les répétitions
// naïves (`1111-1111-…`) sont rejetées par `z.string().uuid()` ailleurs dans le
// dépôt ; on garde la même discipline pour que ces fixtures restent
// réutilisables telles quelles.
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';
const OTHER_TENANT = '77777777-7777-4777-8777-777777777777';

const PACK_A = '22222222-2222-4222-8222-222222222222';
const PACK_B = '2222222b-2222-4222-8222-222222222222';

const SUBJECT_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUBJECT_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const SUBJECT_3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const TEAM = '33333333-3333-4333-8333-333333333333';

const AVATAR_1 = 'https://cdn.test/avatar-1.png';
const PHOTO_PATH = 'tcg/joueuse-1.png';
/** Ce que rend `storage.getPublicUrl` dans le mock, bucket `teams-images`. */
const PHOTO_URL = `https://storage.example.test/teams-images/${PHOTO_PATH}`;

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

/** Un paquet, ouvert par défaut : un paquet fermé ne contient encore rien. */
function seedPack(
  id: string,
  over: {
    userId?: string;
    tenantId?: string;
    openedAt?: string | null;
  } = {}
) {
  (store.tcg_packs ||= []).push({
    id,
    tenant_id: over.tenantId ?? DEFAULT_TENANT_ID,
    user_id: over.userId ?? OWNER,
    source_match_id: '44444444-4444-4444-8444-444444444444',
    granted_at: '2026-01-01T00:00:00.000Z',
    opened_at:
      over.openedAt === undefined ? '2026-01-02T00:00:00.000Z' : over.openedAt,
  });
}

let _position = 0;
/** Une carte de joueuse dans un paquet. `recycled_at` NULL = encore possédée. */
function seedPlayerCard(
  packId: string,
  userId: string,
  over: {
    rarity?: string;
    isFoil?: boolean;
    recycledAt?: string | null;
  } = {}
) {
  _position += 1;
  (store.tcg_pack_cards ||= []).push({
    pack_id: packId,
    position: _position,
    subject_kind: 'player',
    card_user_id: userId,
    card_team_id: null,
    rarity: over.rarity ?? 'common',
    is_foil: over.isFoil ?? false,
    recycled_at: over.recycledAt ?? null,
  });
}

function seedTeamCard(
  packId: string,
  teamId: string,
  over: { rarity?: string } = {}
) {
  _position += 1;
  (store.tcg_pack_cards ||= []).push({
    pack_id: packId,
    position: _position,
    subject_kind: 'team',
    card_user_id: null,
    card_team_id: teamId,
    rarity: over.rarity ?? 'common',
    is_foil: false,
    recycled_at: null,
  });
}

/** La fiche de classement d'une joueuse : c'est elle qui porte l'avatar public. */
function seedRating(
  userId: string,
  displayName: string,
  avatarUrl: string | null = null,
  tenantId: string = DEFAULT_TENANT_ID
) {
  (store.player_ratings ||= []).push({
    user_id: userId,
    tenant_id: tenantId,
    display_name: displayName,
    avatar_url: avatarUrl,
    rating: 1500,
  });
}

/**
 * L'état de consentement d'une joueuse. `photo_status` et `revoked_at` forment
 * ENSEMBLE le filtre : approuvée ET non révoquée.
 */
function seedPhoto(
  userId: string,
  photoStatus: 'none' | 'pending' | 'approved' | 'rejected',
  over: { revokedAt?: string | null; photoPath?: string | null } = {}
) {
  (store.tcg_player_cards ||= []).push({
    tenant_id: DEFAULT_TENANT_ID,
    user_id: userId,
    opted_in_at: '2026-01-01T00:00:00.000Z',
    revoked_at: over.revokedAt ?? null,
    photo_path: over.photoPath === undefined ? PHOTO_PATH : over.photoPath,
    photo_status: photoStatus,
  });
}

async function getCollection() {
  const res = makeRes();
  await handler(makeReq(), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: OWNER });
  _position = 0;
});

/* -------------------------------------------------------------------------- */
/* Ce qui entre dans la collection — et ce qui n'y entre pas                    */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — périmètre', () => {
  it('rend une collection vide, sans erreur, quand la joueuse n’a aucun paquet', async () => {
    // État parfaitement normal de quelqu'un qui vient d'arriver : ni 404 ni
    // 500. La page doit pouvoir afficher « rien pour l'instant », pas un
    // message d'erreur.
    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ cards: [], distinct: 0, total: 0 });
  });

  it('ignore les cartes d’un paquet FERMÉ', async () => {
    // Le suspense de l'ouverture EST le produit. Un paquet non ouvert dont le
    // contenu fuiterait dans la collection éventerait le tirage avant qu'il
    // ait lieu — et les cartes n'existent d'ailleurs en base qu'à l'ouverture.
    // On sème quand même des lignes rattachées au paquet fermé : c'est le seul
    // moyen de prouver que c'est bien l'état du PAQUET qui filtre.
    seedPack(PACK_A); // ouvert
    seedPack(PACK_B, { openedAt: null }); // fermé
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedRating(SUBJECT_2, 'Joueuse 2');
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPlayerCard(PACK_B, SUBJECT_2);
    seedPlayerCard(PACK_B, SUBJECT_2);

    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body.distinct).toBe(1);
    expect(res.body.total).toBe(1);
    expect(res.body.cards[0].userId).toBe(SUBJECT_1);
  });

  it('ignore les paquets d’une AUTRE joueuse', async () => {
    // La collection est celle de l'appelante, pas celle du tenant.
    seedPack(PACK_A, { userId: OTHER_USER });
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1);

    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ cards: [], distinct: 0, total: 0 });
  });

  it('ignore les paquets d’un AUTRE tenant', async () => {
    // Même identifiant de joueuse, autre organisation : les collections ne se
    // mélangent pas. Le filtre porte sur les paquets ; les cartes, elles, ne
    // sont scopées que par leur paquet — d'où l'intérêt de le figer ici.
    seedPack(PACK_A, { tenantId: OTHER_TENANT });
    seedPack(PACK_B); // tenant courant, pour prouver qu'on lit bien quelque chose
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedRating(SUBJECT_2, 'Joueuse 2');
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPlayerCard(PACK_B, SUBJECT_2);

    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body.distinct).toBe(1);
    expect(res.body.cards[0].userId).toBe(SUBJECT_2);
  });
});

/* -------------------------------------------------------------------------- */
/* Agrégation : regroupement, comptage, meilleure rareté                        */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — agrégation', () => {
  it('regroupe par sujet : deux exemplaires = 1 carte distincte, 2 exemplaires', async () => {
    // La distinction « distinct » / « total » est ce que la page affiche
    // (« 1 carte différente · 2 exemplaires »). Un regroupement qui casserait
    // afficherait deux vignettes identiques, ce que personne ne signalerait
    // comme un bug — d'où ce test.
    seedPack(PACK_A);
    seedPack(PACK_B);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPlayerCard(PACK_B, SUBJECT_1);

    const res = await getCollection();

    expect(res.statusCode).toBe(200);
    expect(res.body.distinct).toBe(1);
    expect(res.body.total).toBe(2);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].count).toBe(2);
  });

  it('ne confond pas une carte de joueuse et une carte d’équipe', async () => {
    // Le regroupement se fait sur `kind:subjectId`, pas sur l'identifiant seul :
    // deux sujets de nature différente restent deux cartes.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    (store.teams ||= []).push({
      id: TEAM,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Hinode Sparkles',
      short_name: 'HIN',
      slug: 'hinode-sparkles',
      logo_url: '/img/teams-images/hinode-sparkles.png',
    });
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedTeamCard(PACK_A, TEAM);

    const res = await getCollection();

    expect(res.body.distinct).toBe(2);
    const team = res.body.cards.find((c: any) => c.kind === 'team');
    // La face d'équipe est relue elle aussi : un identifiant nu ne s'affiche pas.
    expect(team).toMatchObject({
      teamId: TEAM,
      name: 'Hinode Sparkles',
      slug: 'hinode-sparkles',
      logoUrl: '/img/teams-images/hinode-sparkles.png',
    });
  });

  it('rend la MEILLEURE rareté possédée, quel que soit l’ordre des exemplaires', async () => {
    // La rareté est FIGÉE AU TIRAGE : deux exemplaires du même sujet peuvent
    // légitimement différer (la joueuse a gagné un tournoi entre les deux
    // ouvertures). La vignette doit montrer la meilleure — sinon un exemplaire
    // légendaire disparaîtrait derrière un commun, et la collection vaudrait
    // moins que son contenu réel.
    //
    // L'ordre d'insertion compte : la comparaison ne doit pas se réduire à
    // « la dernière lue gagne ». On sème donc la légendaire EN PREMIER, puis
    // deux communes derrière.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1, { rarity: 'legendary' });
    seedPlayerCard(PACK_A, SUBJECT_1, { rarity: 'common' });
    seedPlayerCard(PACK_A, SUBJECT_1, { rarity: 'rare' });

    const res = await getCollection();

    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].rarity).toBe('legendary');
    expect(res.body.cards[0].count).toBe(3);
  });

  it('signale un brillant dès qu’UN exemplaire l’est', async () => {
    // `isFoil` est un « au moins un », pas la propriété du dernier exemplaire lu.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1, { isFoil: true });
    seedPlayerCard(PACK_A, SUBJECT_1, { isFoil: false });

    const res = await getCollection();

    expect(res.body.cards[0].isFoil).toBe(true);
  });

  it('trie les plus rares d’abord', async () => {
    // Une collection se regarde par ses pièces fortes. On sème dans l'ordre
    // inverse du résultat attendu, sans quoi le test passerait même sans tri.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Commune');
    seedRating(SUBJECT_2, 'Épique');
    seedRating(SUBJECT_3, 'Légendaire');
    seedPlayerCard(PACK_A, SUBJECT_1, { rarity: 'common' });
    seedPlayerCard(PACK_A, SUBJECT_2, { rarity: 'epic' });
    seedPlayerCard(PACK_A, SUBJECT_3, { rarity: 'legendary' });

    const res = await getCollection();

    expect(res.body.cards.map((c: any) => c.rarity)).toEqual([
      'legendary',
      'epic',
      'common',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Cartes recyclées — colonne récente, rien d'autre ne la protège               */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — cartes recyclées', () => {
  it('retire de la collection un exemplaire recyclé, sans faire disparaître les autres', async () => {
    // Le cas central du recyclage : on revend UN doublon sur trois. La ligne
    // recyclée reste en base (le crédit doit rester explicable), mais elle ne
    // compte plus comme possédée. Sans ce filtre, on vendrait une carte ET on
    // la garderait.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPlayerCard(PACK_A, SUBJECT_1, {
      recycledAt: '2026-09-14T10:00:00.000Z',
    });

    const res = await getCollection();

    expect(res.body.distinct).toBe(1);
    expect(res.body.total).toBe(2);
    expect(res.body.cards[0].count).toBe(2);
  });

  it('fait disparaître la carte quand TOUS ses exemplaires sont recyclés', async () => {
    // Pas de vignette fantôme à zéro exemplaire : le sujet quitte la
    // collection. C'est aussi ce qui interdit de recycler une carte puis de la
    // recycler à nouveau depuis l'interface.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedRating(SUBJECT_2, 'Joueuse 2');
    seedPlayerCard(PACK_A, SUBJECT_1, {
      recycledAt: '2026-09-14T10:00:00.000Z',
    });
    seedPlayerCard(PACK_A, SUBJECT_2);

    const res = await getCollection();

    expect(res.body.distinct).toBe(1);
    expect(res.body.cards.map((c: any) => c.userId)).toEqual([SUBJECT_2]);
  });

  it('n’altère pas la meilleure rareté restante quand la meilleure a été recyclée', async () => {
    // Corollaire discret du filtre : la rareté affichée se calcule sur ce
    // qu'on POSSÈDE ENCORE. Une légendaire revendue ne doit pas continuer à
    // décorer la vignette d'une commune.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1');
    seedPlayerCard(PACK_A, SUBJECT_1, {
      rarity: 'legendary',
      recycledAt: '2026-09-14T10:00:00.000Z',
    });
    seedPlayerCard(PACK_A, SUBJECT_1, { rarity: 'common' });

    const res = await getCollection();

    expect(res.body.cards[0].rarity).toBe('common');
    expect(res.body.cards[0].count).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* LA GARANTIE DE CONSENTEMENT, VUE DEPUIS LA COLLECTION D'UN TIERS             */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — consentement photo', () => {
  /** Le décor commun : OWNER possède une carte de SUBJECT_1, qui a un avatar. */
  function seedOnePlayerCard() {
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1', AVATAR_1);
    seedPlayerCard(PACK_A, SUBJECT_1);
  }

  it('sert la photo quand elle est approuvée et non révoquée', async () => {
    // Le cas nominal, indispensable comme témoin : sans lui, les cas négatifs
    // ci-dessous passeraient au vert même si PLUS AUCUNE photo n'était servie.
    seedOnePlayerCard();
    seedPhoto(SUBJECT_1, 'approved');

    const res = await getCollection();

    expect(res.body.cards[0].imageUrl).toBe(PHOTO_URL);
  });

  it('ne sert PAS une photo en attente de modération — repli sur l’avatar public', async () => {
    // Modération AVANT publication. La joueuse voit sa propre photo `pending`
    // dans son espace ; personne d'autre ne doit la voir sur une carte.
    seedOnePlayerCard();
    seedPhoto(SUBJECT_1, 'pending');

    const res = await getCollection();

    expect(res.body.cards[0].imageUrl).toBe(AVATAR_1);
    expect(res.body.cards[0].imageUrl).not.toContain(PHOTO_PATH);
  });

  it('ne sert PAS une photo refusée — repli sur l’avatar public', async () => {
    // Un refus qui laisserait la photo atteignable serait décoratif.
    seedOnePlayerCard();
    seedPhoto(SUBJECT_1, 'rejected');

    const res = await getCollection();

    expect(res.body.cards[0].imageUrl).toBe(AVATAR_1);
    expect(res.body.cards[0].imageUrl).not.toContain(PHOTO_PATH);
  });

  it('ne sert PAS une photo dont l’accord a été RETIRÉ, sur une carte DÉJÀ distribuée', async () => {
    // LE cas qui justifie que la face soit relue à chaque appel plutôt que
    // figée au tirage. La carte a été distribuée alors que la photo était
    // approuvée ; la joueuse s'est retirée depuis. Le retrait doit atteindre
    // les exemplaires déjà en circulation, y compris chez quelqu'un d'autre.
    //
    // Noter que `photo_status` reste `approved` : c'est bien `revoked_at` seul
    // qui tranche ici. Un filtre qui n'en garderait qu'une moitié laisserait ce
    // cas passer.
    seedOnePlayerCard();
    seedPhoto(SUBJECT_1, 'approved', {
      revokedAt: '2026-09-14T12:00:00.000Z',
    });

    const res = await getCollection();

    expect(res.body.cards[0].imageUrl).toBe(AVATAR_1);
    expect(res.body.cards[0].imageUrl).not.toContain(PHOTO_PATH);
  });

  it('ne montre aucune image quand il n’y a ni photo consentie ni avatar', async () => {
    // Repli du repli : `null`, jamais un portrait inventé. L'appelant affiche
    // alors un fond de marque — le projet n'utilise aucune image générée.
    seedPack(PACK_A);
    seedRating(SUBJECT_1, 'Joueuse 1', null);
    seedPlayerCard(PACK_A, SUBJECT_1);
    seedPhoto(SUBJECT_1, 'pending');

    const res = await getCollection();

    expect(res.body.cards[0].imageUrl).toBeNull();
    expect(res.body.cards[0].displayName).toBe('Joueuse 1');
  });

  it('garde la carte d’une joueuse sans fiche de classement', async () => {
    // Une joueuse présente au roster mais jamais notée n'a pas de ligne
    // `player_ratings`. Elle doit rester dans la collection avec une face
    // minimale, plutôt que d'en disparaître : sa carte a bien été tirée.
    seedPack(PACK_A);
    seedPlayerCard(PACK_A, SUBJECT_1);

    const res = await getCollection();

    expect(res.body.distinct).toBe(1);
    expect(res.body.cards[0]).toMatchObject({
      userId: SUBJECT_1,
      displayName: null,
      imageUrl: null,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Chemins dégradés                                                             */
/* -------------------------------------------------------------------------- */

describe('GET /api/player/tcg/collection — accès', () => {
  it('refuse une requête sans jeton', async () => {
    const res = makeRes();
    await handler(makeReq({ headers: { host: 'h' } }), res);

    expect(res.statusCode).toBe(401);
  });

  it('refuse une méthode autre que GET, et annonce ce qui est permis', async () => {
    // Lire une collection n'écrit rien : l'en-tête `Allow` évite qu'un client
    // se contente du code d'erreur pour deviner.
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
