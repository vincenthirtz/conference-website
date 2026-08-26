// utils/maps/generate.ts
// Assemble une recette en scène voxel : terrain (layout) + silhouettes posées sur
// les ancres + props dispersés. Entièrement déterministe (graine = slug), donc la
// vignette pré-rendue et le rendu 3D à la demande montrent exactement la même
// maquette.

import { SceneBuilder } from './builder';
import { buildEnvironment, buildLayout, GROUND_HEIGHT, patchShade } from './layouts';
import { buildLandmark } from './landmarks';
import { canDress, groundProp, shrub } from './props';
import { createRng } from './rng';
import type { Brick, MapLayout, MapRecipe, VoxelScene } from './types';
import { MAP_LAYOUTS } from './types';

/**
 * `map_type` (registre de jeux / tenant_map_pool) -> archétype de terrain.
 * Tout type inconnu retombe sur `standard` : ajouter un jeu ne casse rien.
 */
export function layoutForMapType(mapType: string | null | undefined): MapLayout {
  const t = (mapType ?? '').trim().toLowerCase();
  if ((MAP_LAYOUTS as readonly string[]).includes(t)) return t as MapLayout;
  // Alias rencontrés dans les autres jeux du registre.
  if (t === 'assault' || t === 'bomb' || t === 'search') return 'standard';
  if (t === 'active-duty' || t === 'competitive') return 'standard';
  if (t === 'payload') return 'escort';
  if (t === 'domination' || t === 'koth') return 'control';
  if (t === 'convergence') return 'flashpoint';
  return 'standard';
}

/**
 * Disperse des props bas sur les colonnes de sol libres. Uniquement au niveau du
 * terrain (pas sur les toits), et jamais sur une surface `highlight` : ce serait
 * encombrer l'objectif, qui doit rester lisible en vignette.
 */
function scatterProps(
  b: SceneBuilder,
  rng: ReturnType<typeof createRng>,
  density: number,
  vegetation: number,
): void {
  if (density <= 0) return;
  const attempts = Math.round(160 * density);
  for (let i = 0; i < attempts; i += 1) {
    const x = rng.int(-13, 13);
    const z = rng.int(-13, 13);
    if (!canDress(b, x, z, GROUND_HEIGHT)) continue;
    const y = GROUND_HEIGHT;
    if (rng.next() < vegetation) shrub(b, x, y, z, rng);
    else groundProp(b, x, y, z, rng);
  }
}

/** Part de végétation dans les props, selon la nappe qui entoure la maquette. */
const VEGETATION: Record<string, number> = {
  sea: 0.3,
  grass: 0.55,
  sand: 0.12,
  snow: 0.15,
  lava: 0.05,
};

/**
 * Altitude de pose d'une silhouette : le PLUS BAS des sommets de colonne du 3x3
 * autour de l'ancre, les colonnes vides exclues.
 *
 * WHY: prendre bêtement `columnTop(ancre)` suffit tant que rien d'autre
 * n'occupe la case. Dès qu'un prop fin s'y trouve — une balise d'objectif, un
 * lampadaire — la silhouette est posée à son sommet, donc en l'air, et le
 * sous-bassement automatique lui coule des pilotis de dix mètres. Regarder le
 * voisinage rend la pose insensible à ce genre d'accident.
 */
function anchorBase(b: SceneBuilder, x: number, z: number): number {
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const top = b.columnTop(x + dx, z + dz);
      if (top === 0) continue; // colonne vide : ne dit rien du niveau du sol
      if (top < best) best = top;
    }
  }
  return Number.isFinite(best) ? best : 0;
}

function computeBounds(bricks: Brick[]): VoxelScene['bounds'] {
  if (bricks.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const brick of bricks) {
    if (brick.x < minX) minX = brick.x;
    if (brick.x > maxX) maxX = brick.x;
    if (brick.y < minY) minY = brick.y;
    if (brick.y > maxY) maxY = brick.y;
    if (brick.z < minZ) minZ = brick.z;
    if (brick.z > maxZ) maxZ = brick.z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** Construit la scène voxel d'une recette. Pure et déterministe. */
export function generateScene(recipe: MapRecipe): VoxelScene {
  const rng = createRng(recipe.slug);
  const builder = new SceneBuilder();

  const { anchors } = buildLayout(recipe, builder, rng);

  recipe.landmarks.slice(0, anchors.length).forEach((kind, i) => {
    const anchor = anchors[i];
    const baseY = anchorBase(builder, anchor.x, anchor.z);
    // Une ancre tombée dans le vide (bord effrité du sol) : on ne pose rien.
    if (baseY === 0) return;
    const mark = builder.mark();
    buildLandmark(kind, builder, anchor.x, anchor.z, baseY, rng);
    // La silhouette peut déborder du terrain : on lui coule un socle.
    builder.underpin(mark, baseY, 'ground', patchShade);
  });

  scatterProps(
    builder,
    rng,
    recipe.scatter ?? 0.4,
    recipe.environment ? (VEGETATION[recipe.environment.kind] ?? 0.35) : 0.35,
  );
  // En dernier : la nappe ne remplit que ce qui est resté vide.
  buildEnvironment(builder, recipe);

  const bricks = builder.toBricks();
  return { recipe, bricks, bounds: computeBounds(bricks) };
}
