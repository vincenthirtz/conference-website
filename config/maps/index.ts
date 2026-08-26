// config/maps/index.ts
// Registre des recettes de maquettes voxel, par jeu.
//
// Deux niveaux :
//   1. recette ÉCRITE À LA MAIN (config/maps/<jeu>.ts) — le lot pilote ;
//   2. recette DÉRIVÉE, calculée depuis le slug et le map_type — filet de
//      sécurité pour les ~200 maps des huit jeux du registre et pour les maps
//      ajoutées à la main dans `tenant_map_pool`.
//
// La dérivation est déterministe (hash du slug) : une map non écrite à la main
// garde la même maquette d'un rendu à l'autre, et deux maps différentes du même
// type ne se ressemblent pas.

import { hashSeed } from '@/utils/maps/rng';
import { mapSlug } from '@/utils/maps/slug';
import { layoutForMapType } from '@/utils/maps/generate';
import type { LandmarkKind, MapMood, MapPalette, MapRecipe } from '@/utils/maps/types';
import { OVERWATCH_RECIPES } from './overwatch';

const RECIPES_BY_GAME: Record<string, MapRecipe[]> = {
  overwatch: OVERWATCH_RECIPES,
};

/** Palettes de repli — harmonies neutres, aucune n'imite une charte d'éditeur. */
const FALLBACK_PALETTES: MapPalette[] = [
  ['#8b8f96', '#5f6672', '#3f4653', '#e0b354'], // acier
  ['#b9a582', '#8a6f4e', '#5d4632', '#f0cf87'], // sable
  ['#7f9c86', '#4f6b58', '#33463c', '#e8d98a'], // forêt
  ['#9aa7b8', '#63718a', '#3c465c', '#7fd6e8'], // brume
  ['#b58a7a', '#8c5347', '#5a3230', '#f2b263'], // terre cuite
  ['#8f8aa8', '#5d5878', '#3a374d', '#d7a4e8'], // crépuscule
  ['#a8b0a2', '#6f7a6b', '#454d43', '#e5e0b8'], // olive
  ['#8fa0a8', '#57696f', '#334146', '#8fe0c8'], // ardoise
];

const FALLBACK_LANDMARKS: LandmarkKind[][] = [
  ['tower', 'arch', 'billboard'],
  ['dome', 'statue', 'tree'],
  ['crane', 'tower', 'ruin'],
  ['spire', 'arch', 'tree'],
  ['ruin', 'arch', 'statue'],
  ['windmill', 'tree', 'tower'],
  ['pyramid', 'ruin', 'tree'],
  ['billboard', 'crane', 'arch'],
];

const FALLBACK_MOODS: MapMood[] = ['day', 'day', 'dusk', 'night'];

/**
 * Recette dérivée pour une map sans recette écrite à la main.
 * Déterministe : même slug -> même maquette, toujours.
 */
export function deriveRecipe(name: string, mapType?: string | null): MapRecipe {
  const slug = mapSlug(name);
  const h = hashSeed(slug);
  return {
    slug,
    name,
    layout: layoutForMapType(mapType),
    palette: FALLBACK_PALETTES[h % FALLBACK_PALETTES.length],
    landmarks: FALLBACK_LANDMARKS[(h >>> 5) % FALLBACK_LANDMARKS.length],
    mood: FALLBACK_MOODS[(h >>> 11) % FALLBACK_MOODS.length],
    scatter: 0.3 + ((h >>> 17) % 5) * 0.08,
  };
}

/**
 * Recette d'une map. Ne renvoie jamais null : à défaut de recette écrite, une
 * recette dérivée est calculée. `mapType` n'est utilisé que pour la dérivation.
 */
export function getMapRecipe(game: string, mapName: string, mapType?: string | null): MapRecipe {
  const slug = mapSlug(mapName);
  const authored = RECIPES_BY_GAME[game]?.find((r) => r.slug === slug);
  return authored ?? deriveRecipe(mapName, mapType);
}

/** true si la map a une recette écrite à la main (utile aux outils d'authoring). */
export function hasAuthoredRecipe(game: string, mapName: string): boolean {
  const slug = mapSlug(mapName);
  return Boolean(RECIPES_BY_GAME[game]?.some((r) => r.slug === slug));
}

/** Toutes les recettes écrites à la main, tous jeux confondus. */
export function listAuthoredRecipes(): { game: string; recipe: MapRecipe }[] {
  return Object.entries(RECIPES_BY_GAME).flatMap(([game, recipes]) =>
    recipes.map((recipe) => ({ game, recipe })),
  );
}
