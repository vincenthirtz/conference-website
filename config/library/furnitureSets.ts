// config/library/furnitureSets.ts — LES SETS du grand catalogue de la Women's
// Library (lot 11 de docs/PLAN-womens-library.md, conference-website).
//
// Un set est un REGROUPEMENT dans le catalogue (la boutique filtre par set),
// pas un paquet vendu à part : chaque meuble s'achète seul, à son prix.
//
//   - set THÉMATIQUE (`theme`) : bibliothèque, esport, cosy, jardin d'hiver ;
//   - set d'ÉVÉNEMENT (`event`) : Halloween, Octobre Rose. Ses meubles ne
//     sont en vente QUE pendant sa fenêtre — limités dans le TEMPS, jamais en
//     quantité. L'achat la vérifie côté API (`isFurnitureOnSale`) ; un meuble
//     acheté pendant la fenêtre reste à sa propriétaire et se pose toujours.
//
// APPARTENANCE. Une base listée ici entraîne toutes ses variantes de couleur
// (même famille) ; une variante peut en plus être listée seule (une teinte
// « Citrouille » du canapé n'existe qu'à Halloween). Un meuble appartient à
// AU PLUS un set d'événement : c'est lui qui donne sa fenêtre.
//
// FENÊTRES : [from, until[, instants ISO avec le décalage de Paris. Une
// nouvelle édition (Halloween 2027) déplace la fenêtre ici ; les meubles déjà
// achetés ne bougent pas.
//
// Module PUR (aucun import) : il est recopié tel quel dans le site.

export const FURNITURE_SET_IDS = [
  'library',
  'esport',
  'cosy',
  'winter_garden',
  'halloween',
  'pink_october',
] as const;
export type FurnitureSetId = (typeof FURNITURE_SET_IDS)[number];

/** Fenêtre de vente d'un meuble d'événement : de `from` (inclus) à `until` (exclu). */
export type FurnitureWindow = { from: string; until: string };

export type FurnitureSet = {
  id: FurnitureSetId;
  kind: 'theme' | 'event';
  /** Seulement pour un set d'événement. */
  window?: FurnitureWindow;
  /** Clés du catalogue : une base entraîne ses variantes. */
  keys: readonly string[];
};

/** Halloween 2026 : du samedi 17 octobre au lundi 2 novembre inclus (Paris). */
export const HALLOWEEN_2026: FurnitureWindow = {
  from: '2026-10-17T00:00:00+02:00',
  until: '2026-11-03T00:00:00+01:00',
};

/** Octobre Rose 2026 : tout le mois d'octobre (Paris). */
export const PINK_OCTOBER_2026: FurnitureWindow = {
  from: '2026-10-01T00:00:00+02:00',
  until: '2026-11-01T00:00:00+01:00',
};

export const LIBRARY_FURNITURE_SETS: readonly FurnitureSet[] = [
  {
    id: 'library',
    kind: 'theme',
    keys: [
      'bookshelf',
      'bookshelf_filled',
      'bookshelf_double',
      'shelf_small',
      'display_shelves',
      'shelf_tall',
      'shelf_industrial',
      'reading_table',
      'desk',
      'bankers_lamp',
      'lamp',
      'oil_lamp',
      'globe',
      'library_ladder',
      'notice_board',
      'bust_pedestal',
      'reception_desk',
      'armchair_green',
      'sofa_chesterfield',
      'rug_red',
      'rug_green',
      'wall_clock',
      'mantel_clock',
      'card_catalog',
      'lectern',
      'book_stack',
      'book_tower',
      'chalkboard',
      'school_desk',
      'school_chair',
      'gothic_cabinet',
      'gothic_commode',
      'coffee_table_gothic',
      'carved_chair',
      'carved_chest',
      'hutch',
    ],
  },
  {
    id: 'esport',
    kind: 'theme',
    keys: [
      'gaming_desk',
      'pc_tower',
      'arcade_cabinet',
      'neon_heart',
      'neon_bolt',
      'bean_bag',
      'trophy',
      'trophy_pedestal',
      'tv_retro',
      'game_console',
      'chess_set',
      'boombox',
      'dartboard',
      'projector_screen',
      'desk_lamp_pipe',
      'bar_stool',
      'coffee_table_industrial',
      'armchair_scandi',
    ],
  },
  {
    id: 'cosy',
    kind: 'theme',
    keys: [
      'armchair',
      'sofa',
      'sofa_large',
      'sofa_painted',
      'ottoman',
      'rocking_chair',
      'lounge_chair',
      'armchair_scandi',
      'daybed',
      'bed',
      'bed_iron',
      'floor_lamp',
      'candles',
      'candlestick',
      'fireplace',
      'rug_round',
      'floor_cushion',
      'throw_pillows',
      'side_table',
      'nightstand',
      'nightstand_painted',
      'coffee_table',
      'coffee_table_round',
      'coffee_table_modern',
      'coffee_table_square',
      'tea_table',
      'tea_set',
      'wicker_basket',
      'stool_lacquer',
      'folding_screen',
      'spinning_wheel',
      'vase',
      'vase_tall',
      'vase_round',
      'mirror',
      'frame_painting',
      'frame_modern',
      'frame_small',
      'frame_landscape',
      'phone_clock',
    ],
  },
  {
    id: 'winter_garden',
    kind: 'theme',
    keys: [
      'plant_tall',
      'plant_medium',
      'cactus',
      'planter_box',
      'planter_box_long',
      'planter_box_tall',
      'bench',
      'chair_painted',
      'stool',
      'stool_painted',
      'stool_folding',
      'round_table',
      'garden_set',
      'garden_gnome',
      'cat_statue',
      'watering_can',
      'lantern',
      'garden_lamp',
      'fire_pit',
      'wine_barrel',
      'wooden_crate',
      'vase_brass',
      'cabinet',
    ],
  },
  {
    id: 'halloween',
    kind: 'event',
    window: HALLOWEEN_2026,
    keys: [
      'pumpkin',
      'jack_o_lantern',
      'pumpkin_pile',
      'cauldron',
      'gravestone',
      'ghost',
      'bat_garland',
      'rug_halloween',
      'sofa_pumpkin',
    ],
  },
  {
    id: 'pink_october',
    kind: 'event',
    window: PINK_OCTOBER_2026,
    keys: [
      'pink_ribbon',
      'neon_ribbon',
      'rug_rose',
      'bean_bag_rose',
      'bankers_lamp_rose',
    ],
  },
];

/** Vrai pendant la fenêtre : `from` ≤ maintenant < `until`. */
export function isWithinWindow(window: FurnitureWindow, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(window.from) <= t && t < Date.parse(window.until);
}
