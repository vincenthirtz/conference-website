// config/library/furnitureLot11.ts — LES NOUVEAUX MODÈLES du grand catalogue
// de la Women's Library (lot 11 de docs/PLAN-womens-library.md,
// conference-website). Leurs variantes de couleur sont dans
// furnitureVariants.ts, leurs sets dans furnitureSets.ts.
//
// Reporté de `tools/library-assets/catalog-draft.json` (site), généré par le
// pipeline depuis le manifeste RENDU, comme le lot 3 : empreinte (cases de
// 0,5 m), hauteur (m), catégorie, assise, empilable et calque sont ceux des
// sprites, à l'identique — un test le vérifie quand le site est cloné à côté.
// Sources, toutes en CC0 : Poly Haven, ou fait maison par le pipeline
// (bureau de jeu, borne d'arcade, néons, citrouilles, ruban rose…).
//
// Une ligne par meuble : f(clé, catégorie, [w, d], hauteur, prix, drapeaux).
// Drapeaux : 'sit' (on s'y assoit), 'stack' (petit objet qui POURRA se poser
// sur un autre), 'wall' (accroché au mur du fond), 'floor' (tapis).
//
// Module PUR (aucun import de valeur) : il est recopié tel quel dans le site.

import type { FurnitureBase, FurnitureCategory } from './furniture';

type Flag = 'sit' | 'stack' | 'wall' | 'floor';

function f(
  key: string,
  category: FurnitureCategory,
  [w, d]: [number, number],
  heightM: number,
  price: number,
  flags: readonly Flag[] = []
): FurnitureBase {
  const layer = flags.includes('wall')
    ? 'wall'
    : flags.includes('floor')
      ? 'floor'
      : undefined;
  return {
    key,
    category,
    footprint: { w, d },
    heightM,
    price,
    sittable: flags.includes('sit'),
    stackable: flags.includes('stack'),
    ...(layer ? { layer } : {}),
  };
}

export const LOT11_FURNITURE: readonly FurnitureBase[] = [
  // Rangements
  f('shelf_tall', 'storage', [2, 1], 2.08, 400),
  f('card_catalog', 'storage', [4, 2], 1.09, 500),
  f('gothic_cabinet', 'storage', [4, 3], 2.36, 950),
  f('gothic_commode', 'storage', [3, 1], 1.21, 450),
  f('carved_chest', 'storage', [2, 1], 0.49, 300),
  f('shelf_industrial', 'storage', [1, 1], 2.14, 350),
  f('hutch', 'storage', [4, 2], 2.24, 900),
  f('wicker_basket', 'storage', [1, 1], 0.22, 50),
  f('wine_barrel', 'storage', [2, 2], 0.87, 200),
  f('treasure_chest', 'storage', [2, 1], 0.62, 400),
  f('wooden_crate', 'storage', [2, 1], 0.35, 60),
  // Assises
  f('school_chair', 'seating', [1, 2], 1.01, 90, ['sit']),
  f('carved_chair', 'seating', [1, 2], 1.03, 200, ['sit']),
  f('sofa_chesterfield', 'seating', [4, 2], 0.71, 550, ['sit']),
  f('sofa_painted', 'seating', [5, 2], 1.28, 650, ['sit']),
  f('armchair_scandi', 'seating', [2, 2], 1.02, 300, ['sit']),
  f('stool_painted', 'seating', [1, 1], 0.58, 60, ['sit']),
  f('stool_folding', 'seating', [1, 1], 0.44, 50, ['sit']),
  f('bar_stool', 'seating', [1, 1], 0.75, 90, ['sit']),
  f('stool_lacquer', 'seating', [1, 1], 0.63, 80, ['sit']),
  f('bean_bag', 'seating', [2, 2], 0.36, 150, ['sit']),
  f('floor_cushion', 'seating', [1, 1], 0.14, 60, ['sit']),
  // Tables
  f('school_desk', 'table', [2, 1], 0.88, 150),
  f('coffee_table_gothic', 'table', [3, 3], 0.56, 280),
  f('coffee_table_industrial', 'table', [2, 2], 0.64, 180),
  f('coffee_table_modern', 'table', [2, 3], 0.39, 200),
  f('coffee_table_square', 'table', [3, 3], 0.37, 250),
  f('nightstand_painted', 'table', [1, 1], 0.62, 100),
  f('tea_table', 'table', [2, 2], 0.5, 200),
  f('garden_set', 'table', [2, 4], 0.86, 500),
  f('gaming_desk', 'table', [3, 2], 1.19, 600),
  // Lumières
  f('oil_lamp', 'lighting', [1, 1], 0.8, 120, ['stack']),
  f('candlestick', 'lighting', [1, 1], 0.22, 50, ['stack']),
  f('lantern', 'lighting', [1, 1], 0.53, 90),
  f('garden_lamp', 'lighting', [1, 2], 2.58, 300, ['wall']),
  f('desk_lamp_pipe', 'lighting', [1, 1], 0.36, 80, ['stack']),
  f('neon_heart', 'lighting', [2, 1], 1.9, 150, ['wall']),
  f('neon_bolt', 'lighting', [1, 1], 1.95, 150, ['wall']),
  f('candles', 'lighting', [1, 1], 0.22, 70, ['stack']),
  f('jack_o_lantern', 'lighting', [1, 1], 0.31, 120),
  f('neon_ribbon', 'lighting', [1, 1], 1.9, 150, ['wall']),
  // Lits
  f('bed_iron', 'bed', [2, 4], 1.2, 500, ['sit']),
  // Plantes
  f('planter_box', 'plant', [2, 1], 0.42, 150),
  f('planter_box_long', 'plant', [3, 1], 0.45, 200),
  f('planter_box_tall', 'plant', [2, 2], 0.86, 250),
  // Décoration
  f('tv_retro', 'decor', [1, 1], 0.46, 150, ['stack']),
  f('game_console', 'decor', [1, 1], 0.1, 120, ['stack']),
  f('chess_set', 'decor', [1, 1], 0.11, 120, ['stack']),
  f('boombox', 'decor', [2, 1], 0.47, 90, ['stack']),
  f('dartboard', 'decor', [1, 1], 1.9, 100, ['wall']),
  f('projector_screen', 'decor', [2, 2], 1.8, 350),
  f('mantel_clock', 'decor', [1, 1], 0.16, 120, ['stack']),
  f('chalkboard', 'decor', [2, 2], 1.51, 250),
  f('throw_pillows', 'decor', [2, 2], 0.45, 80),
  f('tea_set', 'decor', [2, 1], 0.16, 90, ['stack']),
  f('folding_screen', 'decor', [3, 1], 1.6, 350),
  f('spinning_wheel', 'decor', [1, 2], 0.97, 300),
  f('garden_gnome', 'decor', [1, 1], 0.6, 80),
  f('cat_statue', 'decor', [1, 1], 0.28, 100),
  f('watering_can', 'decor', [1, 1], 0.2, 50),
  f('fire_pit', 'decor', [3, 3], 0.39, 400),
  f('vase_tall', 'decor', [1, 1], 0.41, 60, ['stack']),
  f('vase_round', 'decor', [1, 1], 0.31, 60, ['stack']),
  f('vase_brass', 'decor', [1, 1], 0.69, 120),
  f('frame_small', 'decor', [1, 1], 1.95, 90, ['wall']),
  f('frame_landscape', 'decor', [2, 1], 1.81, 220, ['wall']),
  f('phone_clock', 'decor', [1, 1], 1.9, 150, ['wall']),
  f('pc_tower', 'decor', [1, 1], 0.49, 150),
  f('arcade_cabinet', 'decor', [2, 2], 1.75, 750),
  f('trophy', 'decor', [1, 1], 0.39, 200, ['stack']),
  f('trophy_pedestal', 'decor', [1, 1], 1.59, 600),
  f('lectern', 'decor', [1, 1], 1.1, 250),
  f('book_stack', 'decor', [1, 1], 0.16, 60, ['stack']),
  f('book_tower', 'decor', [1, 1], 0.3, 90),
  f('fireplace', 'decor', [3, 1], 1.12, 900),
  f('pumpkin', 'decor', [1, 1], 0.28, 60),
  f('pumpkin_pile', 'decor', [2, 2], 0.38, 180),
  f('cauldron', 'decor', [1, 1], 0.47, 250),
  f('gravestone', 'decor', [1, 1], 0.67, 150),
  f('ghost', 'decor', [2, 2], 0.97, 200),
  f('bat_garland', 'decor', [2, 1], 1.89, 100, ['wall']),
  f('pink_ribbon', 'decor', [1, 1], 0.7, 250),
];
