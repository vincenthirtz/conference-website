// features/player/library/ui/shop/shopModel.ts — la logique PURE de la
// boutique du grand catalogue (lot 11 de docs/PLAN-womens-library.md) :
// regrouper les variantes par famille, ne montrer que ce qui est en vente,
// filtrer (catégorie, set, prix), chercher, paginer. Sans React ni réseau :
// testé seul (tests/unit/libraryShopModel.test.ts).
//
// UNE CARTE = UNE FAMILLE : le modèle, et la liste de ses teintes. Une teinte
// d'événement (canapé « citrouille ») n'apparaît que pendant sa fenêtre ; la
// fermeture d'une fenêtre retire la teinte, pas la famille. L'API reste juge :
// elle refuse l'achat hors fenêtre (`furniture_not_on_sale`).

import type { LibraryCatalogItem } from '../../responses';

/** Tranches de prix du filtre (barème du lot 2 : 50 à 1 000 pièces). */
export const PRICE_BANDS = ['small', 'medium', 'large'] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export function priceBandOf(price: number): PriceBand {
  if (price <= 100) return 'small';
  if (price < 500) return 'medium';
  return 'large';
}

/** Un meuble est en vente sans fenêtre, ou dans [from, until[. */
export function isOnSale(item: LibraryCatalogItem, now: Date): boolean {
  if (!item.window) return true;
  const t = now.getTime();
  return Date.parse(item.window.from) <= t && t < Date.parse(item.window.until);
}

/** Famille d'une entrée : la sienne si l'API (antérieure au lot 11) n'en dit rien. */
export const familyOf = (item: LibraryCatalogItem): string =>
  item.family || item.key;

/** Sets d'une entrée (aucun si l'API n'en dit rien). */
export const setsOf = (item: LibraryCatalogItem): readonly string[] =>
  item.sets ?? [];

export type ShopFamily = {
  /** Clé de la base. */
  family: string;
  category: LibraryCatalogItem['category'];
  /** Teintes EN VENTE, base d'abord quand elle l'est (ordre du catalogue). */
  members: LibraryCatalogItem[];
};

/**
 * Les familles en vente maintenant, dans l'ordre du catalogue (première
 * apparition). Une famille sans teinte en vente disparaît.
 */
export function shopFamilies(
  furniture: readonly LibraryCatalogItem[],
  now: Date
): ShopFamily[] {
  const byFamily = new Map<string, ShopFamily>();
  for (const item of furniture) {
    if (!isOnSale(item, now)) continue;
    const family = familyOf(item);
    let f = byFamily.get(family);
    if (!f) {
      f = { family, category: item.category, members: [] };
      byFamily.set(family, f);
    }
    f.members.push(item);
  }
  return [...byFamily.values()];
}

export type ShopFilters = {
  query: string;
  category: string | null;
  set: string | null;
  price: PriceBand | null;
};

export const EMPTY_FILTERS: ShopFilters = {
  query: '',
  category: null,
  set: null,
  price: null,
};

/** Minuscules, sans accents ni ponctuation : « Bougeoir » ≈ « bougeoir ». */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Les textes où chercher pour une teinte : noms, teinte, catégorie, sets. */
export type SearchTexts = (item: LibraryCatalogItem) => string[];

/**
 * Filtre les familles. Les filtres de set, de prix et la recherche portent
 * sur les TEINTES : une famille reste si au moins une teinte passe, et la
 * carte ne montre que celles-là (chercher « rose » ouvre le canapé sur sa
 * teinte rose). Chaque mot cherché doit se trouver quelque part.
 */
export function filterFamilies(
  families: readonly ShopFamily[],
  filters: ShopFilters,
  texts: SearchTexts
): ShopFamily[] {
  const words = normalizeSearch(filters.query).split(' ').filter(Boolean);
  const out: ShopFamily[] = [];
  for (const f of families) {
    if (filters.category && f.category !== filters.category) continue;
    const members = f.members.filter((m) => {
      if (filters.set && !setsOf(m).includes(filters.set)) return false;
      if (filters.price && priceBandOf(m.price) !== filters.price) return false;
      if (!words.length) return true;
      const hay = normalizeSearch(texts(m).join(' '));
      return words.every((w) => hay.includes(w));
    });
    if (members.length) out.push({ ...f, members });
  }
  return out;
}

export type Page<T> = { items: T[]; page: number; pageCount: number };

/** Page `page` (1-based, ramenée dans les bornes) de `perPage` éléments. */
export function paginate<T>(
  list: readonly T[],
  page: number,
  perPage: number
): Page<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / perPage));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return {
    items: list.slice((p - 1) * perPage, p * perPage),
    page: p,
    pageCount,
  };
}

/** Teinte d'une entrée, pour le sélecteur (sRGB). */
export const COLOR_SWATCHES: Readonly<Record<string, string>> = {
  natural: '#b88a5a',
  linen: '#cfc6b8',
  cream: '#e8dcc4',
  white: '#ece8e0',
  grey: '#8f9096',
  charcoal: '#3e3e44',
  black: '#222224',
  brown: '#6b4630',
  chocolate: '#4a3026',
  cognac: '#9c582c',
  walnut: '#6e4a32',
  oak: '#c89c68',
  red: '#a8342e',
  burgundy: '#842434',
  terracotta: '#be623c',
  orange: '#d6682a',
  ochre: '#be8432',
  mustard: '#d6a236',
  yellow: '#ecca52',
  gold: '#deb246',
  silver: '#c8ccd2',
  green: '#467a54',
  teal: '#287a7c',
  cyan: '#28d2ff',
  blue: '#3a5c9c',
  navy: '#283660',
  purple: '#7a4ca0',
  pink: '#e27ea2',
  pumpkin: '#d6681c',
  october_pink: '#e85a9a',
};

/** Pastille d'une teinte inconnue (une API plus récente que ce site). */
export const UNKNOWN_SWATCH = '#6b6b70';

/** La teinte à afficher d'une entrée. */
export function swatchOf(variant: string | null | undefined): string {
  return (
    (variant && Object.hasOwn(COLOR_SWATCHES, variant)
      ? COLOR_SWATCHES[variant]
      : null) ?? UNKNOWN_SWATCH
  );
}

/** Dernier jour d'une fenêtre (`until` est exclu) : la veille de `until`. */
export function lastDayOf(window: { until: string }): Date {
  return new Date(Date.parse(window.until) - 1);
}
