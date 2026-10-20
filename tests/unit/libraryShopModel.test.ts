// Women's Library, lot 11 — la logique PURE de la boutique du grand catalogue
// (features/player/library/ui/shop/shopModel.ts) :
//   * une carte par FAMILLE, la base d'abord, ses teintes en vente ensuite ;
//   * une teinte d'événement n'est en vente que dans sa fenêtre [from, until[ ;
//   * filtres (catégorie, set, prix) et recherche (sans accents, tous les
//     mots) portent sur les teintes, la carte ne montre que celles qui passent ;
//   * pagination bornée ; une réponse d'API sans famille reste lisible.
// Le catalogue utilisé est le VRAI (copie synchronisée de l'API).

import { describe, expect, it } from 'vitest';
import {
  LIBRARY_FURNITURE,
  type Furniture,
} from '../../config/library/furniture';
import { placementLayerOf } from '../../features/player/library/placement';
import type { LibraryCatalogItem } from '../../features/player/library/responses';
import {
  EMPTY_FILTERS,
  filterFamilies,
  isOnSale,
  lastDayOf,
  normalizeSearch,
  paginate,
  priceBandOf,
  shopFamilies,
  swatchOf,
  UNKNOWN_SWATCH,
} from '../../features/player/library/ui/shop/shopModel';

const asItem = (f: Furniture): LibraryCatalogItem => ({
  key: f.key,
  category: f.category,
  footprint: { ...f.footprint },
  heightM: f.heightM,
  price: f.price,
  sittable: f.sittable,
  stackable: f.stackable,
  layer: placementLayerOf(f),
  family: f.family,
  variant: f.variant ?? null,
  sets: [...f.sets],
  window: f.window ?? null,
});
const CATALOG = LIBRARY_FURNITURE.map(asItem);
const HALLOWEEN = new Date('2026-10-31T18:00:00Z');
const DECEMBER = new Date('2026-12-10T10:00:00Z');
/** Recherche « à plat » : la clé, la famille et la teinte suffisent ici. */
const texts = (i: LibraryCatalogItem) => [
  i.key.replace(/_/g, ' '),
  i.variant ?? '',
  ...(i.sets ?? []),
];

describe('shopFamilies', () => {
  it('une carte par famille, base en tête, teintes dans l’ordre du catalogue', () => {
    const fams = shopFamilies(CATALOG, DECEMBER);
    const sofa = fams.find((f) => f.family === 'sofa');
    expect(sofa?.members.map((m) => m.key)).toEqual([
      'sofa',
      'sofa_blue',
      'sofa_green',
      'sofa_pink',
      'sofa_charcoal',
      'sofa_mustard',
    ]);
    // Une famille = une carte : bien moins de cartes que d'entrées.
    expect(fams.length).toBeLessThan(CATALOG.length);
    expect(new Set(fams.map((f) => f.family)).size).toBe(fams.length);
  });

  it('une teinte d’événement n’est en vente que pendant sa fenêtre', () => {
    const during = shopFamilies(CATALOG, HALLOWEEN);
    expect(
      during.find((f) => f.family === 'sofa')?.members.map((m) => m.key)
    ).toContain('sofa_pumpkin');
    expect(during.some((f) => f.family === 'pumpkin')).toBe(true);
    const after = shopFamilies(CATALOG, DECEMBER);
    expect(
      after.find((f) => f.family === 'sofa')?.members.map((m) => m.key)
    ).not.toContain('sofa_pumpkin');
    expect(after.some((f) => f.family === 'pumpkin')).toBe(false);
    expect(after.some((f) => f.family === 'pink_ribbon')).toBe(false);
  });

  it('isOnSale : from inclus, until exclu', () => {
    const pumpkin = CATALOG.find((i) => i.key === 'pumpkin')!;
    const until = new Date(pumpkin.window!.until);
    expect(isOnSale(pumpkin, new Date(until.getTime() - 1))).toBe(true);
    expect(isOnSale(pumpkin, until)).toBe(false);
    expect(isOnSale(pumpkin, new Date(pumpkin.window!.from))).toBe(true);
    // Dernier jour affiché : la veille de `until` (2 novembre à Paris).
    expect(
      lastDayOf(pumpkin.window!).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Paris',
      })
    ).toBe('2 novembre');
  });

  it('une réponse d’API sans famille (avant le lot 11) : chaque meuble est sa famille', () => {
    const legacy = CATALOG.slice(0, 5).map(
      ({ family: _f, variant: _v, sets: _s, window: _w, ...rest }) => rest
    );
    const fams = shopFamilies(legacy, DECEMBER);
    expect(fams.map((f) => f.family)).toEqual(legacy.map((i) => i.key));
    expect(
      filterFamilies(fams, { ...EMPTY_FILTERS, set: 'library' }, texts)
    ).toEqual([]);
  });
});

describe('filterFamilies', () => {
  const fams = shopFamilies(CATALOG, HALLOWEEN);

  it('par catégorie, par set, par prix', () => {
    const rugs = filterFamilies(
      fams,
      { ...EMPTY_FILTERS, category: 'rug' },
      texts
    );
    expect(rugs.length).toBeGreaterThan(0);
    expect(rugs.every((f) => f.category === 'rug')).toBe(true);

    const halloween = filterFamilies(
      fams,
      { ...EMPTY_FILTERS, set: 'halloween' },
      texts
    );
    // Le canapé reste, mais sa carte ne montre que sa teinte « citrouille ».
    expect(
      halloween.find((f) => f.family === 'sofa')?.members.map((m) => m.key)
    ).toEqual(['sofa_pumpkin']);
    expect(
      halloween.every((f) =>
        f.members.every((m) => m.sets?.includes('halloween'))
      )
    ).toBe(true);

    const cheap = filterFamilies(
      fams,
      { ...EMPTY_FILTERS, price: 'small' },
      texts
    );
    expect(cheap.every((f) => f.members.every((m) => m.price <= 100))).toBe(
      true
    );
    const big = filterFamilies(
      fams,
      { ...EMPTY_FILTERS, price: 'large' },
      texts
    );
    expect(big.every((f) => f.members.every((m) => m.price >= 500))).toBe(true);
  });

  it('recherche : tous les mots, sans accents ni casse, sur les teintes', () => {
    const pinkSofa = filterFamilies(
      fams,
      { ...EMPTY_FILTERS, query: 'Sofa  PINK' },
      texts
    );
    expect(pinkSofa.map((f) => f.family)).toEqual(['sofa']);
    expect(pinkSofa[0].members.map((m) => m.key)).toEqual(['sofa_pink']);
    expect(
      filterFamilies(fams, { ...EMPTY_FILTERS, query: 'introuvable' }, texts)
    ).toEqual([]);
    expect(normalizeSearch('  Étagère d’Été ! ')).toBe('etagere d ete');
  });
});

describe('paginate, prix, teintes', () => {
  it('pages de 24, bornées', () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    expect(paginate(list, 1, 24)).toMatchObject({ page: 1, pageCount: 3 });
    expect(paginate(list, 3, 24).items).toEqual([48, 49]);
    expect(paginate(list, 9, 24).page).toBe(3);
    expect(paginate(list, 0, 24).page).toBe(1);
    expect(paginate([], 1, 24)).toEqual({ items: [], page: 1, pageCount: 1 });
  });

  it('tranches de prix du barème', () => {
    expect(priceBandOf(50)).toBe('small');
    expect(priceBandOf(100)).toBe('small');
    expect(priceBandOf(101)).toBe('medium');
    expect(priceBandOf(499)).toBe('medium');
    expect(priceBandOf(500)).toBe('large');
  });

  it('chaque teinte du catalogue a sa pastille', () => {
    for (const i of CATALOG)
      if (i.variant)
        expect(swatchOf(i.variant), i.key).not.toBe(UNKNOWN_SWATCH);
    expect(swatchOf('inconnue')).toBe(UNKNOWN_SWATCH);
    expect(swatchOf(null)).toBe(UNKNOWN_SWATCH);
  });
});
