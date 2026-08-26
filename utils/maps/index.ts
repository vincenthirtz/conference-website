// utils/maps/index.ts
// Point d'entrée du générateur de maquettes voxel.
//
// Usage typique :
//   const recipe = getMapRecipe('overwatch', "King's Row");
//   const svg = renderIsoSvg(generateScene(recipe), { tile: 14 });

export { SceneBuilder } from './builder';
export { generateScene, layoutForMapType } from './generate';
export { renderIsoSvg, type IsoSvgOptions } from './isoSvg';
export { createRng, hashSeed, type Rng } from './rng';
export { mapSlug } from './slug';
export * from './types';
