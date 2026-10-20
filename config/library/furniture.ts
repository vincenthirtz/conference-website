// config/library/furniture.ts — LE CATALOGUE DES MEUBLES de la Women's Library
// (lots 2 et 4 de docs/PLAN-womens-library.md, conference-website).
//
// SOURCE DE VÉRITÉ UNIQUE, synchronisée vers le site. Elle sert à trois choses :
//   - le PRIX d'un achat (`POST /api/player/library/furniture/buy`) : il vient
//     d'ici, jamais du client ;
//   - les COLLISIONS côté API (lot 4, `features/player/library/placement.ts`) :
//     empreinte au sol en cases et CALQUE (`layer`) ;
//   - le PIPELINE GRAPHIQUE du site (`tools/library-assets/`, Blender en ligne
//     de commande) : il rend UN jeu de sprites par clé (4 rotations, en 2×) et
//     écrit un manifeste (empreinte, ancrage, hauteur). L'empreinte et la
//     hauteur déclarées ici DOIVENT être celles du manifeste du pipeline :
//     une empreinte qui diverge ferait tenir un meuble sur des cases que son
//     image ne couvre pas. Ajouter une clé ici, c'est commander un rendu.
//
// UNITÉS. Une case fait 0,5 m de côté (décision du 2026-10-19). `footprint.w`
// court le long de l'axe x de la salle, `footprint.d` le long de l'axe y, à la
// rotation 0 ; les rotations 1 et 3 les échangent. `heightM` est la hauteur
// réelle du modèle, en mètres.
//
// LE CATALOGUE DU LOT 3 (49 meubles). Reporté de
// `tools/library-assets/catalog-draft.json` (site), généré par le pipeline
// depuis le manifeste RENDU : empreintes, hauteurs, catégories, assise,
// empilable et calque y sont ceux des sprites, à l'identique (vérifié le
// 2026-10-19 contre `public/library/spike/manifest.json`). Les prix sont les
// `suggestedPrice` du brouillon, sauf pour les trois meubles du lot 2 :
//   - `armchair` (250) et `lamp` (75) GARDENT leur prix ;
//   - `bookshelf` passe de 500 à 250 : vide, il coûterait plus cher que le
//     rayonnage GARNI (450) et presque autant que le DOUBLE (850). Les pièces
//     maîtresses de la Grande salle de lecture sont désormais ceux-là. Rien
//     n'a encore été vendu (migration non appliquée) : aucun achat touché.
//
// CALQUES (`layer`, comme le moteur du site) : absent = un objet, qui bloque
// la marche et ne partage aucune case avec un autre objet ; `floor` = un tapis,
// sous les meubles ; `wall` = accroché à un mur du fond (cadres, miroir,
// horloge), dos contre le mur. Les chevauchements ne se comptent qu'au sein
// d'un même calque.
//
// BARÈME, calé sur le booster (300 pièces) : de 50 à 100 pour un petit meuble,
// de 500 à 1 000 pour une pièce maîtresse, l'entre-deux pour le reste. La
// monnaie se GAGNE, elle ne s'achète pas, et un meuble ne se revend pas contre
// des pièces. Changer un prix ne touche pas les meubles déjà achetés : le
// registre garde le montant réellement débité.
//
// LE GRAND CATALOGUE (lot 11, 2026-10-20). Les 49 meubles du lot 3 restent
// ici, à l'identique (aucune clé renommée ni retirée : des joueuses peuvent
// les posséder). S'y ajoutent :
//   - les nouveaux modèles (`furnitureLot11.ts`), reportés du brouillon du
//     pipeline comme ceux du lot 3 ;
//   - les VARIANTES DE COULEUR (`furnitureVariants.ts`) : une clé chacune,
//     rattachée à une FAMILLE (la clé de sa base), dont elle reprend tout sauf
//     la teinte ;
//   - les SETS et les fenêtres des meubles d'événement (`furnitureSets.ts`).
// Chaque entrée exportée porte donc `family`, `variant` (clé de teinte, s'il
// y en a), `sets` et `window` (meuble d'événement seulement). Une base est sa
// propre famille ; ses variantes la suivent dans la liste.
//
// Module PUR : il n'importe que ses voisins du même dossier, purs eux aussi,
// et tout est recopié tel quel dans le site.

import { LOT11_FURNITURE } from './furnitureLot11';
import {
  type FurnitureSetId,
  type FurnitureWindow,
  isWithinWindow,
  LIBRARY_FURNITURE_SETS,
} from './furnitureSets';
import {
  type FurnitureColor,
  LIBRARY_FAMILY_COLORS,
  LIBRARY_FURNITURE_VARIANTS,
} from './furnitureVariants';

export type { FurnitureSetId, FurnitureWindow } from './furnitureSets';
export type { FurnitureColor } from './furnitureVariants';

export const FURNITURE_CATEGORIES = [
  'storage',
  'seating',
  'lighting',
  'table',
  'decor',
  'bed',
  'rug',
  'plant',
] as const;
export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

/** Côté d'une case, en mètres. Le moteur et le pipeline partagent cette unité. */
export const LIBRARY_TILE_SIZE_M = 0.5;

/** Chaque meuble est rendu sous 4 rotations (0 à 3, quart de tour horaire). */
export const FURNITURE_ROTATIONS = 4;

/** Bornes du barème, en pièces. Un prix hors bornes est une faute de saisie. */
export const FURNITURE_PRICE_MIN = 50;
export const FURNITURE_PRICE_MAX = 1000;

/**
 * Format d'une clé : il est aussi vérifié par la base (`library_inventory`
 * `furniture_key`) et sert de nom de fichier aux sprites.
 */
export const FURNITURE_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

/**
 * Calque d'un meuble : `floor` (tapis) et `wall` (accroché au mur du fond) ne
 * bloquent pas la marche et ne se heurtent qu'entre meubles du même calque.
 * Absent = un objet ordinaire.
 */
export const FURNITURE_LAYERS = ['floor', 'wall'] as const;
export type FurnitureLayer = (typeof FURNITURE_LAYERS)[number];

/** Ce qu'on écrit pour un modèle : le reste (famille, sets…) est déduit. */
export type FurnitureBase = {
  /** Clé stable : nom des sprites, ligne d'inventaire. Ne jamais renommer. */
  key: string;
  category: FurnitureCategory;
  /** Empreinte au sol à la rotation 0, en cases de 0,5 m. */
  footprint: { w: number; d: number };
  /** Hauteur réelle du modèle, en mètres (celle du manifeste du pipeline). */
  heightM: number;
  /** Prix en pièces gagnées. */
  price: number;
  /** Un avatar peut s'y asseoir. */
  sittable: boolean;
  /**
   * Petit objet qui POURRA être posé sur un autre meuble (une lampe de
   * bureau sur une table). Pas d'empilement en v1 : sans effet aujourd'hui.
   */
  stackable: boolean;
  /** Calque (absent = objet). Celui du manifeste du pipeline. */
  layer?: FurnitureLayer;
};

export type Furniture = FurnitureBase & {
  /** Clé de la base de la famille ; une base est sa propre famille. */
  family: string;
  /** Teinte de cette entrée, si sa famille a des variantes. */
  variant?: FurnitureColor;
  /** Sets auxquels le meuble appartient (ceux de sa famille compris). */
  sets: readonly FurnitureSetId[];
  /** Meuble d'événement : en vente seulement pendant cette fenêtre. */
  window?: FurnitureWindow;
};

/** Les 49 meubles du lot 3, tels qu'ils ont été rendus et vendus. */
const LOT3_FURNITURE: readonly FurnitureBase[] = [
  // Rangements
  {
    key: 'bookshelf',
    category: 'storage',
    footprint: { w: 3, d: 1 },
    heightM: 2.06,
    price: 250,
    sittable: false,
    stackable: false,
  },
  {
    key: 'bookshelf_filled',
    category: 'storage',
    footprint: { w: 3, d: 1 },
    heightM: 2.06,
    price: 450,
    sittable: false,
    stackable: false,
  },
  {
    key: 'bookshelf_double',
    category: 'storage',
    footprint: { w: 3, d: 2 },
    heightM: 2.06,
    price: 850,
    sittable: false,
    stackable: false,
  },
  {
    key: 'shelf_small',
    category: 'storage',
    footprint: { w: 1, d: 1 },
    heightM: 1.13,
    price: 150,
    sittable: false,
    stackable: false,
  },
  {
    key: 'display_shelves',
    category: 'storage',
    footprint: { w: 2, d: 1 },
    heightM: 1.56,
    price: 300,
    sittable: false,
    stackable: false,
  },
  {
    key: 'wardrobe',
    category: 'storage',
    footprint: { w: 2, d: 2 },
    heightM: 2.57,
    price: 500,
    sittable: false,
    stackable: false,
  },
  {
    key: 'cabinet',
    category: 'storage',
    footprint: { w: 3, d: 1 },
    heightM: 1.13,
    price: 250,
    sittable: false,
    stackable: false,
  },
  {
    key: 'drawer_cabinet',
    category: 'storage',
    footprint: { w: 3, d: 1 },
    heightM: 1.88,
    price: 300,
    sittable: false,
    stackable: false,
  },
  {
    key: 'sideboard',
    category: 'storage',
    footprint: { w: 5, d: 1 },
    heightM: 0.68,
    price: 350,
    sittable: false,
    stackable: false,
  },
  // Assises
  {
    key: 'armchair',
    category: 'seating',
    footprint: { w: 2, d: 2 },
    heightM: 1.07,
    price: 250,
    sittable: true,
    stackable: false,
  },
  {
    key: 'armchair_green',
    category: 'seating',
    footprint: { w: 2, d: 2 },
    heightM: 1.06,
    price: 300,
    sittable: true,
    stackable: false,
  },
  {
    key: 'chair',
    category: 'seating',
    footprint: { w: 1, d: 1 },
    heightM: 0.97,
    price: 80,
    sittable: true,
    stackable: false,
  },
  {
    key: 'chair_painted',
    category: 'seating',
    footprint: { w: 1, d: 1 },
    heightM: 0.96,
    price: 70,
    sittable: true,
    stackable: false,
  },
  {
    key: 'sofa',
    category: 'seating',
    footprint: { w: 3, d: 2 },
    heightM: 0.8,
    price: 500,
    sittable: true,
    stackable: false,
  },
  {
    key: 'sofa_large',
    category: 'seating',
    footprint: { w: 6, d: 2 },
    heightM: 1.12,
    price: 800,
    sittable: true,
    stackable: false,
  },
  {
    key: 'bench',
    category: 'seating',
    footprint: { w: 3, d: 1 },
    heightM: 0.89,
    price: 150,
    sittable: true,
    stackable: false,
  },
  {
    key: 'ottoman',
    category: 'seating',
    footprint: { w: 2, d: 2 },
    heightM: 0.62,
    price: 100,
    sittable: true,
    stackable: false,
  },
  {
    key: 'lounge_chair',
    category: 'seating',
    footprint: { w: 2, d: 3 },
    heightM: 1.17,
    price: 600,
    sittable: true,
    stackable: false,
  },
  {
    key: 'rocking_chair',
    category: 'seating',
    footprint: { w: 2, d: 2 },
    heightM: 0.99,
    price: 350,
    sittable: true,
    stackable: false,
  },
  {
    key: 'stool',
    category: 'seating',
    footprint: { w: 1, d: 1 },
    heightM: 0.44,
    price: 50,
    sittable: true,
    stackable: false,
  },
  // Tables
  {
    key: 'reading_table',
    category: 'table',
    footprint: { w: 5, d: 2 },
    heightM: 1.14,
    price: 600,
    sittable: false,
    stackable: false,
  },
  {
    key: 'desk',
    category: 'table',
    footprint: { w: 3, d: 1 },
    heightM: 0.83,
    price: 250,
    sittable: false,
    stackable: false,
  },
  {
    key: 'coffee_table',
    category: 'table',
    footprint: { w: 3, d: 2 },
    heightM: 0.52,
    price: 200,
    sittable: false,
    stackable: false,
  },
  {
    key: 'coffee_table_round',
    category: 'table',
    footprint: { w: 3, d: 3 },
    heightM: 0.49,
    price: 220,
    sittable: false,
    stackable: false,
  },
  {
    key: 'side_table',
    category: 'table',
    footprint: { w: 1, d: 1 },
    heightM: 0.55,
    price: 90,
    sittable: false,
    stackable: false,
  },
  {
    key: 'nightstand',
    category: 'table',
    footprint: { w: 1, d: 1 },
    heightM: 0.7,
    price: 100,
    sittable: false,
    stackable: false,
  },
  {
    key: 'round_table',
    category: 'table',
    footprint: { w: 2, d: 2 },
    heightM: 0.75,
    price: 180,
    sittable: false,
    stackable: false,
  },
  {
    key: 'console_table',
    category: 'table',
    footprint: { w: 3, d: 1 },
    heightM: 0.95,
    price: 250,
    sittable: false,
    stackable: false,
  },
  {
    key: 'reception_desk',
    category: 'table',
    footprint: { w: 5, d: 2 },
    heightM: 1.42,
    price: 900,
    sittable: false,
    stackable: false,
  },
  // Lumières
  {
    key: 'lamp',
    category: 'lighting',
    footprint: { w: 1, d: 2 },
    heightM: 0.89,
    price: 75,
    sittable: false,
    stackable: true,
  },
  {
    key: 'bankers_lamp',
    category: 'lighting',
    footprint: { w: 1, d: 1 },
    heightM: 0.38,
    price: 120,
    sittable: false,
    stackable: true,
  },
  {
    key: 'floor_lamp',
    category: 'lighting',
    footprint: { w: 1, d: 1 },
    heightM: 1.65,
    price: 150,
    sittable: false,
    stackable: false,
  },
  // Lits
  {
    key: 'bed',
    category: 'bed',
    footprint: { w: 3, d: 4 },
    heightM: 1.53,
    price: 800,
    sittable: true,
    stackable: false,
  },
  {
    key: 'daybed',
    category: 'bed',
    footprint: { w: 4, d: 2 },
    heightM: 1.13,
    price: 600,
    sittable: true,
    stackable: false,
  },
  // Plantes
  {
    key: 'plant_tall',
    category: 'plant',
    footprint: { w: 1, d: 1 },
    heightM: 1.22,
    price: 150,
    sittable: false,
    stackable: false,
  },
  {
    key: 'plant_medium',
    category: 'plant',
    footprint: { w: 1, d: 1 },
    heightM: 0.67,
    price: 100,
    sittable: false,
    stackable: false,
  },
  {
    key: 'cactus',
    category: 'plant',
    footprint: { w: 1, d: 1 },
    heightM: 0.27,
    price: 50,
    sittable: false,
    stackable: true,
  },
  // Tapis (calque du sol : sous les meubles, ne bloquent pas la marche)
  {
    key: 'rug_red',
    category: 'rug',
    footprint: { w: 6, d: 4 },
    heightM: 0.02,
    price: 400,
    sittable: false,
    stackable: false,
    layer: 'floor',
  },
  {
    key: 'rug_green',
    category: 'rug',
    footprint: { w: 8, d: 6 },
    heightM: 0.02,
    price: 450,
    sittable: false,
    stackable: false,
    layer: 'floor',
  },
  {
    key: 'rug_round',
    category: 'rug',
    footprint: { w: 4, d: 4 },
    heightM: 0.02,
    price: 300,
    sittable: false,
    stackable: false,
    layer: 'floor',
  },
  // Décoration (les cadres, le miroir et l’horloge s’accrochent au mur du fond : calque mural)
  {
    key: 'globe',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 0.9,
    price: 500,
    sittable: false,
    stackable: false,
  },
  {
    key: 'library_ladder',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 2.21,
    price: 250,
    sittable: false,
    stackable: false,
  },
  {
    key: 'notice_board',
    category: 'decor',
    footprint: { w: 3, d: 1 },
    heightM: 1.92,
    price: 300,
    sittable: false,
    stackable: false,
  },
  {
    key: 'bust_pedestal',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 1.56,
    price: 650,
    sittable: false,
    stackable: false,
  },
  {
    key: 'vase',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 0.44,
    price: 80,
    sittable: false,
    stackable: false,
  },
  {
    key: 'frame_painting',
    category: 'decor',
    footprint: { w: 2, d: 1 },
    heightM: 2.02,
    price: 200,
    sittable: false,
    stackable: false,
    layer: 'wall',
  },
  {
    key: 'frame_modern',
    category: 'decor',
    footprint: { w: 2, d: 1 },
    heightM: 1.85,
    price: 120,
    sittable: false,
    stackable: false,
    layer: 'wall',
  },
  {
    key: 'mirror',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 1.84,
    price: 250,
    sittable: false,
    stackable: false,
    layer: 'wall',
  },
  {
    key: 'wall_clock',
    category: 'decor',
    footprint: { w: 1, d: 1 },
    heightM: 2.07,
    price: 100,
    sittable: false,
    stackable: false,
    layer: 'wall',
  },
];

/** Les sets d'une clé : ceux qui la listent, et ceux qui listent sa famille. */
function setsOf(key: string, family: string): FurnitureSetId[] {
  return LIBRARY_FURNITURE_SETS.filter(
    (s) => s.keys.includes(key) || s.keys.includes(family)
  ).map((s) => s.id);
}

/** La fenêtre de son set d'événement (au plus un, vérifié par les tests). */
function windowOf(
  sets: readonly FurnitureSetId[]
): FurnitureWindow | undefined {
  return LIBRARY_FURNITURE_SETS.find(
    (s) => s.kind === 'event' && sets.includes(s.id)
  )?.window;
}

function entry(
  base: FurnitureBase,
  key: string,
  family: string,
  variant: FurnitureColor | undefined
): Furniture {
  const sets = setsOf(key, family);
  const window = windowOf(sets);
  return {
    ...base,
    key,
    family,
    ...(variant ? { variant } : {}),
    sets,
    ...(window ? { window } : {}),
  };
}

/**
 * Le catalogue complet : chaque base, suivie de ses variantes de couleur.
 * Une variante dont la base manque est une faute de saisie : on lève, au
 * chargement du module (les tests le voient tout de suite).
 */
function assemble(): Furniture[] {
  const bases = [...LOT3_FURNITURE, ...LOT11_FURNITURE];
  const byFamily = new Map<
    string,
    (typeof LIBRARY_FURNITURE_VARIANTS)[number][]
  >();
  for (const v of LIBRARY_FURNITURE_VARIANTS) {
    if (!bases.some((b) => b.key === v.family))
      throw new Error(`variante ${v.key} : famille inconnue ${v.family}`);
    byFamily.set(v.family, [...(byFamily.get(v.family) ?? []), v]);
  }
  const out: Furniture[] = [];
  for (const base of bases) {
    out.push(entry(base, base.key, base.key, LIBRARY_FAMILY_COLORS[base.key]));
    for (const v of byFamily.get(base.key) ?? [])
      out.push(entry(base, v.key, v.family, v.variant));
  }
  return out;
}

export const LIBRARY_FURNITURE: readonly Furniture[] = assemble();

const BY_KEY: ReadonlyMap<string, Furniture> = new Map(
  LIBRARY_FURNITURE.map((item) => [item.key, item])
);

/** Le meuble d'une clé, ou `null` (une clé inconnue n'est pas une erreur ici). */
export function getFurniture(key: unknown): Furniture | null {
  return typeof key === 'string' ? (BY_KEY.get(key) ?? null) : null;
}

export function isFurnitureKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

/**
 * En vente maintenant ? Toujours, sauf un meuble d'événement hors de sa
 * fenêtre. C'est l'achat qui le vérifie ; posséder et poser ne dépendent pas
 * de la fenêtre.
 */
export function isFurnitureOnSale(item: Furniture, now: Date): boolean {
  return !item.window || isWithinWindow(item.window, now);
}

/** Les entrées d'une famille, base en tête (vide pour une famille inconnue). */
export function familyMembers(family: string): Furniture[] {
  return LIBRARY_FURNITURE.filter((f) => f.family === family);
}
