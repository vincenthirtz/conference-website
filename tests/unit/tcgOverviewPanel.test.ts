// Lecture, côté panneau, de la réponse de `GET /api/admin/tcg/overview`.
//
// POURQUOI CE TEST, EN PLUS DU CONTRAT. `tests/unit/adminTcgOverview.test.ts`
// fait passer la VRAIE réponse de l'endpoint dans cette normalisation : il
// attrape les renommages. Celui-ci couvre ce que l'endpoint ne produit PAS en
// temps normal — réponse tronquée, clé dégradée, forme aberrante. Les deux sont
// nécessaires : le premier vérifie l'accord des deux côtés, le second la tenue
// quand cet accord se rompt.
//
// LA CONVENTION QUI PORTE TOUT LE TABLEAU DE BORD : `0` veut dire « mesuré, et
// vide », `null` veut dire « pas mesurable maintenant ». L'endpoint dégrade en
// `null` la seule clé dont la lecture a échoué et rend quand même un 200 — si
// l'affichage confondait les deux, une panne de lecture se lirait comme un
// effondrement de l'économie, exactement le faux signal qu'un tableau de bord
// ne doit pas produire.
//
// Seule la partie PURE est couverte : rendre le composant demanderait un
// routeur et une bibliothèque de test DOM que la politique zéro dépendance
// interdit.

import { describe, it, expect } from 'vitest';

// Le modèle et sa normalisation ont quitté le composant pour
// `utils/tcg/overviewModel.ts` : ce sont des types et des fonctions pures, sans
// une ligne de JSX, et le panneau les importe désormais de là. Ce test pointe
// vers le vrai module plutôt que vers un ré-export de confort — un test qui dit
// d'où vient ce qu'il teste vaut mieux qu'une indirection qui masque la
// frontière.
import {
  normalizeTcgOverview,
  isTcgOverviewEmpty,
} from '@/utils/tcg/overviewModel';

/** Une réponse complète, à la forme rendue par l'endpoint. */
function fullPayload() {
  return {
    packs: {
      granted: 3,
      opened: 2,
      pending: 1,
      bySource: { victory: 2, purchase: 1 },
    },
    coins: {
      inCirculation: 250,
      earned: 250,
      spent: 300,
      wallets: 1,
      boosterPrice: 300,
      truncated: false,
    },
    cards: {
      total: 4,
      foil: 1,
      byRarity: { common: 1, rare: 1, epic: 1, legendary: 1 },
      recycled: 1,
      drawn: 5,
      truncated: false,
    },
    photos: { pending: 2, approved: 1, rejected: 1, optedIn: 4, revoked: 1 },
    topSubjects: [
      {
        kind: 'player',
        userId: 'u1',
        name: 'Nova',
        imageUrl: 'https://cdn.test/nova.png',
        count: 2,
        foilCount: 1,
      },
      {
        kind: 'team',
        teamId: 't1',
        slug: 'les-renardes',
        name: 'Les Renardes',
        imageUrl: '/img/teams-images/renardes.png',
        count: 1,
        foilCount: 0,
      },
    ],
    generatedAt: '2026-09-13T10:00:00.000Z',
  };
}

describe('normalizeTcgOverview — réponse nominale', () => {
  it('lit la forme rendue par l’endpoint, clé pour clé', () => {
    const data = normalizeTcgOverview(fullPayload());

    expect(data.packs).toEqual({
      granted: 3,
      opened: 2,
      pending: 1,
      fromVictory: 2,
      fromPurchase: 1,
    });
    expect(data.coins).toEqual({
      inCirculation: 250,
      earned: 250,
      spent: 300,
      wallets: 1,
      boosterPrice: 300,
      truncated: false,
    });
    expect(data.cards).toEqual({
      total: 4,
      foil: 1,
      byRarity: { common: 1, rare: 1, epic: 1, legendary: 1 },
      recycled: 1,
      drawn: 5,
      truncated: false,
    });
    expect(data.photos).toEqual({
      pending: 2,
      approved: 1,
      rejected: 1,
      optedIn: 4,
      revoked: 1,
    });
    expect(data.generatedAt).toBe('2026-09-13T10:00:00.000Z');
  });

  it('retient l’avertissement de total borné', () => {
    // Un total tronqué présenté comme exact est pire que pas de total : le
    // drapeau doit survivre à la normalisation pour être affiché.
    const raw = fullPayload();
    raw.coins.truncated = true;
    raw.cards.truncated = true;

    const data = normalizeTcgOverview(raw);

    expect(data.coins.truncated).toBe(true);
    expect(data.cards.truncated).toBe(true);
  });

  it('ne tient pour tronqué que ce qui l’est explicitement', () => {
    const data = normalizeTcgOverview({ coins: {}, cards: {} });
    expect(data.coins.truncated).toBe(false);
    expect(data.cards.truncated).toBe(false);
  });
});

describe('normalizeTcgOverview — réponses dégradées', () => {
  it('ne lève sur aucune forme inattendue', () => {
    for (const raw of [null, undefined, 42, 'nope', [], { packs: 'oops' }]) {
      expect(() => normalizeTcgOverview(raw)).not.toThrow();
    }
    const data = normalizeTcgOverview(null);
    expect(data.packs.granted).toBeNull();
    expect(data.coins.inCirculation).toBeNull();
    expect(data.cards.byRarity.legendary).toBeNull();
    expect(data.topSubjects).toEqual([]);
    expect(data.generatedAt).toBeNull();
  });

  it('distingue un zéro mesuré d’une clé dégradée en `null`', () => {
    // C'est le contrat de l'endpoint : il dégrade la SEULE clé dont la lecture
    // a échoué, et rend 200 pour le reste.
    const raw = fullPayload();
    (raw.coins as Record<string, unknown>).inCirculation = null;
    raw.cards.recycled = 0;

    const data = normalizeTcgOverview(raw);

    expect(data.coins.inCirculation).toBeNull();
    expect(data.coins.wallets).toBe(1);
    expect(data.cards.recycled).toBe(0);
  });

  it('écarte les compteurs inexploitables plutôt que de les afficher', () => {
    const data = normalizeTcgOverview({
      packs: { granted: -3, opened: Number.NaN },
      cards: { total: '12' },
    });
    expect(data.packs.granted).toBeNull();
    expect(data.packs.opened).toBeNull();
    expect(data.cards.total).toBeNull();
  });

  it('rejette un horodatage vide', () => {
    expect(normalizeTcgOverview({ generatedAt: '   ' }).generatedAt).toBeNull();
  });
});

describe('normalizeTcgOverview — sujets les plus distribués', () => {
  it('trie par nombre décroissant et relègue les comptes absents', () => {
    const data = normalizeTcgOverview({
      topSubjects: [
        { kind: 'player', userId: 'u1', name: 'A', count: 2 },
        { kind: 'team', teamId: 't1', slug: 'b', name: 'B' },
        { kind: 'player', userId: 'u2', name: 'C', count: 9 },
      ],
    });
    expect(data.topSubjects.map((s) => s.name)).toEqual(['C', 'A', 'B']);
  });

  it('construit les liens des deux natures de sujet', () => {
    const data = normalizeTcgOverview(fullPayload());
    expect(data.topSubjects.map((s) => s.href)).toEqual([
      '/player/u1',
      '/team/les-renardes',
    ]);
    expect(data.topSubjects.map((s) => s.id)).toEqual(['u1', 't1']);
  });

  it('ne fabrique pas de lien qu’on ne peut pas construire', () => {
    // Une équipe sans slug : son uuid ne route nulle part. `TcgCard` a déjà
    // payé cette erreur d'un 404 sur chaque carte d'équipe.
    const data = normalizeTcgOverview({
      topSubjects: [
        { kind: 'team', teamId: 't1', name: 'B' },
        { kind: 'player', name: 'Sans identifiant' },
      ],
    });
    expect(data.topSubjects.map((s) => s.href)).toEqual([null, null]);
  });

  it('écarte les entrées sans nature exploitable', () => {
    const data = normalizeTcgOverview({
      topSubjects: [null, 'x', { kind: 'ghost' }, { kind: 'player', id: 'u1' }],
    });
    expect(data.topSubjects).toHaveLength(1);
    // Sujet non résoluble par `readCardFaces` : la ligne existe, l'affichage la
    // nommera avec son libellé de repli.
    expect(data.topSubjects[0].name).toBeNull();
    // `id` est accepté en repli de `userId` : la ligne reste cliquable.
    expect(data.topSubjects[0].href).toBe('/player/u1');
  });

  it('lit le nombre de brillants sans le confondre avec le total', () => {
    const data = normalizeTcgOverview({
      topSubjects: [{ kind: 'player', userId: 'u1', count: 2, foilCount: 1 }],
    });
    expect(data.topSubjects[0].count).toBe(2);
    expect(data.topSubjects[0].foilCount).toBe(1);
  });
});

describe('isTcgOverviewEmpty', () => {
  it('tient une économie non démarrée pour vide', () => {
    expect(isTcgOverviewEmpty(normalizeTcgOverview(null))).toBe(true);
    expect(
      isTcgOverviewEmpty(
        normalizeTcgOverview({ packs: { granted: 0, opened: 0 } })
      )
    ).toBe(true);
  });

  it('ne compte pas le prix du booster comme une activité', () => {
    // `boosterPrice` est une constante de barème : présente même sur une
    // économie qui n'a jamais tourné. La compter empêcherait à jamais l'état
    // vide de s'afficher.
    expect(
      isTcgOverviewEmpty(normalizeTcgOverview({ coins: { boosterPrice: 300 } }))
    ).toBe(true);
  });

  it('ne tient pas pour vide un tableau de bord qui a quelque chose à dire', () => {
    expect(
      isTcgOverviewEmpty(normalizeTcgOverview({ coins: { wallets: 1 } }))
    ).toBe(false);
    expect(
      isTcgOverviewEmpty(
        normalizeTcgOverview({
          topSubjects: [{ kind: 'player', userId: 'u1', name: 'A' }],
        })
      )
    ).toBe(false);
  });
});
