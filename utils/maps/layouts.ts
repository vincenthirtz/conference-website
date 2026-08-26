// utils/maps/layouts.ts
// Archétypes de terrain. Un layout = la forme du sol, le bâti de remplissage et
// les points d'accroche (« ancres ») où viennent se poser les silhouettes.
//
// WHY:
//   Le `map_type` est DÉJÀ stocké (config/games + tenant_map_pool.map_type). Il
//   porte l'essentiel de l'identité d'une map de tir en équipe : un point de
//   contrôle circulaire, un couloir symétrique, un convoi qui serpente… On le
//   réutilise comme squelette, ce qui divise par dix le travail d'authoring (une
//   recette n'a plus qu'à décrire palette, architecture et silhouettes).
//
// LISIBILITÉ:
//   Le rôle `highlight` est RÉSERVÉ à l'objectif — voie du convoi, plateforme de
//   capture, cœur des îlots — et aux fenêtres allumées. C'est ce qui permet de
//   lire le mode de jeu d'un coup d'œil, y compris sur une vignette de 200 px.
//
// Repère : x et z sont horizontaux et CENTRÉS sur 0, y est la hauteur. Le
// cadrage du rendu se déduit des bornes réelles, donc un layout peut déborder.

import { SceneBuilder } from './builder';
import type { Architecture, MapRecipe } from './types';
import type { Rng } from './rng';

/** Point d'accroche d'une silhouette. `y` est calculé au moment de la pose. */
export type Anchor = { x: number; z: number };

export type LayoutResult = { anchors: Anchor[] };

type LayoutFn = (b: SceneBuilder, rng: Rng, arch: Architecture) => LayoutResult;

const OVER = { keepExisting: false } as const;

/** Épaisseur du terrain jouable. La nappe d'environnement reste 2 crans dessous. */
export const GROUND_HEIGHT = 3;

/**
 * Teinte du sol posée par PLAQUES de 3×3 et non cellule par cellule.
 * Deux raisons : le rendu lit comme un dallage plutôt que comme du bruit, et les
 * faces contiguës de même couleur fusionnent au rendu (cf. isoSvg.ts), ce qui
 * divise par deux le poids du fichier.
 */
export function patchShade(x: number, z: number): number {
  const px = Math.floor((x + 64) / 3);
  const pz = Math.floor((z + 64) / 3);
  let h = (px * 73856093) ^ (pz * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return ((h % 4) - 1.4) * 0.055;
}

/** Sol rectangulaire au bord effrité. */
function slab(b: SceneBuilder, rng: Rng, halfX: number, halfZ: number): void {
  for (let x = -halfX; x <= halfX; x += 1) {
    for (let z = -halfZ; z <= halfZ; z += 1) {
      const edge = Math.max(Math.abs(x) / halfX, Math.abs(z) / halfZ);
      if (edge > 0.85 && rng.chance((edge - 0.85) * 4)) continue;
      b.box(x, 0, z, 1, GROUND_HEIGHT, 1, 'ground', { shade: patchShade(x, z) });
    }
  }
}

/** Sol circulaire au bord effrité — lit comme une île dès qu'il y a une nappe. */
function plate(b: SceneBuilder, rng: Rng, cx: number, cz: number, radius: number): void {
  const r = Math.ceil(radius);
  for (let x = -r; x <= r; x += 1) {
    for (let z = -r; z <= r; z += 1) {
      const d = Math.hypot(x, z);
      if (d > radius) continue;
      if (d > radius - 1.4 && rng.chance(0.4)) continue;
      b.box(cx + x, 0, cz + z, 1, GROUND_HEIGHT, 1, 'ground', {
        shade: patchShade(cx + x, cz + z),
      });
    }
  }
}

/**
 * Bâtiment de remplissage. Son STYLE porte une large part de la reconnaissance :
 * une rue de maisons mitoyennes à toits pentus et une enfilade de cubes blancs à
 * toits plats se lisent très différemment, à palette égale.
 */
function building(
  b: SceneBuilder,
  rng: Rng,
  arch: Architecture,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
): void {
  const y = b.columnTop(cx, cz);
  if (y === 0) return;
  const x0 = cx - Math.floor(w / 2);
  const z0 = cz - Math.floor(d / 2);
  const shade = (rng.int(0, 2) - 1) * 0.06;

  b.box(x0, y, z0, w, h, d, 'structure', { shade });

  // Fenêtres sur les deux faces visibles en isométrie.
  const lit = arch === 'ancient' ? 0.2 : 0.5;
  for (let wy = y + 1; wy < y + h - 1; wy += 2) {
    for (let wx = x0 + 1; wx < x0 + w - 1; wx += 2) {
      if (rng.chance(lit)) b.place(wx, wy, z0 + d - 1, 'highlight', OVER);
    }
    for (let wz = z0 + 1; wz < z0 + d - 1; wz += 2) {
      if (rng.chance(lit)) b.place(x0 + w - 1, wy, wz, 'highlight', OVER);
    }
  }

  switch (arch) {
    case 'terrace': {
      // Toit à deux pentes + cheminée.
      const steps = Math.ceil(d / 2);
      for (let i = 0; i < steps; i += 1) {
        const depth = d - i * 2;
        if (depth <= 0) break;
        b.box(x0, y + h + i, z0 + i, w, 1, depth, 'accent', OVER);
      }
      b.box(x0 + rng.int(0, w - 1), y + h + 2, z0 + 1, 1, 3, 1, 'structure', OVER);
      break;
    }
    case 'whitewash':
      b.box(x0 - 1, y + h, z0 - 1, w + 2, 1, d + 2, 'accent', OVER);
      if (rng.chance(0.4)) b.disc(cx, cz, Math.min(w, d) / 2 - 0.5, y + h + 1, 1, 'accent');
      break;
    case 'industrial':
      b.box(x0 - 1, y + h, z0 - 1, w + 2, 1, d + 2, 'accent', OVER);
      if (rng.chance(0.45)) b.box(x0 + 1, y + h + 1, z0 + 1, 1, rng.int(3, 6), 1, 'structure', OVER);
      break;
    case 'ancient': {
      // Corniche, colonnade périphérique et étage en retrait : sans le
      // décrochement, un volume de pierre lit comme un mur plein.
      b.box(x0 - 1, y + h, z0 - 1, w + 2, 1, d + 2, 'accent', OVER);
      for (let cxx = x0; cxx < x0 + w; cxx += 2) {
        b.box(cxx, y, z0 + d - 1, 1, 2, 1, 'accent', OVER);
        b.box(cxx, y + h - 2, z0 + d - 1, 1, 2, 1, 'accent', OVER);
      }
      for (let czz = z0; czz < z0 + d; czz += 2) {
        b.box(x0 + w - 1, y, czz, 1, 2, 1, 'accent', OVER);
        b.box(x0 + w - 1, y + h - 2, czz, 1, 2, 1, 'accent', OVER);
      }
      const uw = Math.max(2, w - 2);
      const ud = Math.max(2, d - 2);
      b.box(x0 + 1, y + h + 1, z0 + 1, uw, 2, ud, 'structure', { shade });
      b.box(x0, y + h + 3, z0, uw + 2, 1, ud + 2, 'accent', OVER);
      break;
    }
    default:
      b.box(x0 - 1, y + h, z0 - 1, w + 2, 1, d + 2, 'accent', OVER);
      if (rng.chance(0.35)) b.box(cx, y + h + 1, cz, 1, 2, 1, 'highlight', OVER);
  }
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

/** Contrôle : arène circulaire, point central surélevé, deux plateformes. */
const control: LayoutFn = (b, rng, arch) => {
  plate(b, rng, 0, 0, 12.5);
  // Point de capture — seule surface `highlight` du terrain.
  b.disc(0, 0, 5, GROUND_HEIGHT, 2, 'structure');
  b.ring(0, 0, 5.6, 1.5, GROUND_HEIGHT, 2, 'accent');
  b.ring(0, 0, 5.6, 1.5, GROUND_HEIGHT + 2, 1, 'accent');
  b.disc(0, 0, 3.2, GROUND_HEIGHT + 2, 1, 'highlight');
  // Plateformes latérales symétriques et leurs rampes.
  for (const side of [-1, 1]) {
    b.box(side * 9 - 2, GROUND_HEIGHT, -2, 5, 2, 5, 'structure');
    b.box(side * 9 - 2, GROUND_HEIGHT + 2, -2, 5, 1, 5, 'accent', OVER);
    b.path({ x: side * 7, z: 0 }, { x: side * 5, z: 0 }, 3, GROUND_HEIGHT, 1, 'structure');
  }
  building(b, rng, arch, -7, -8, 5, 4, rng.int(4, 6));
  building(b, rng, arch, 7, 8, 5, 4, rng.int(4, 6));
  return {
    anchors: [
      { x: 1, z: -10 },
      { x: -10, z: 6 },
      { x: 9, z: -4 },
    ],
  };
};

/** Escorte : convoi serpentant entre trois jalons. */
const escort: LayoutFn = (b, rng, arch) => {
  slab(b, rng, 13, 13);
  const route: Anchor[] = [
    { x: -12, z: 10 },
    { x: -4, z: 6 },
    { x: 1, z: -1 },
    { x: 11, z: -9 },
  ];
  for (let i = 0; i < route.length - 1; i += 1) {
    // Chaussée sombre bordée par la voie éclairée : le convoi se suit à l'œil.
    b.path(route[i], route[i + 1], 5, GROUND_HEIGHT, 1, 'accent', OVER);
    b.path(route[i], route[i + 1], 3, GROUND_HEIGHT, 1, 'highlight', OVER);
  }
  route.forEach((p, i) => {
    if (i === 0) return;
    for (const s of [-1, 1]) {
      b.box(p.x + s * 3, GROUND_HEIGHT, p.z + s * 3, 1, 5, 1, 'highlight', OVER);
      b.box(p.x + s * 3, GROUND_HEIGHT + 5, p.z + s * 3, 1, 1, 1, 'accent', OVER);
    }
  });
  building(b, rng, arch, -10, -6, 6, 5, rng.int(5, 7));
  building(b, rng, arch, 6, 10, 6, 5, rng.int(4, 6));
  building(b, rng, arch, 12, 4, 5, 5, rng.int(5, 8));
  return {
    anchors: [
      { x: -8, z: -10 },
      { x: 4, z: 11 },
      { x: 11, z: -1 },
    ],
  };
};

/** Hybride : point de capture, puis convoi. */
const hybrid: LayoutFn = (b, rng, arch) => {
  slab(b, rng, 13, 13);
  // Point de capture surélevé.
  b.box(-12, GROUND_HEIGHT, 3, 9, 2, 9, 'structure');
  b.box(-12, GROUND_HEIGHT + 2, 3, 9, 1, 9, 'accent', OVER);
  b.box(-10, GROUND_HEIGHT + 3, 5, 5, 1, 5, 'highlight', OVER);
  const route: Anchor[] = [
    { x: -4, z: 8 },
    { x: 1, z: 2 },
    { x: 11, z: -7 },
  ];
  for (let i = 0; i < route.length - 1; i += 1) {
    b.path(route[i], route[i + 1], 5, GROUND_HEIGHT, 1, 'accent', OVER);
    b.path(route[i], route[i + 1], 3, GROUND_HEIGHT, 1, 'highlight', OVER);
  }
  b.box(11, GROUND_HEIGHT, -10, 1, 6, 1, 'highlight', OVER);
  building(b, rng, arch, -9, -7, 6, 5, rng.int(4, 6));
  building(b, rng, arch, 4, 11, 6, 4, rng.int(4, 6));
  building(b, rng, arch, 12, 6, 5, 5, rng.int(5, 7));
  return {
    anchors: [
      { x: -9, z: -11 },
      { x: 5, z: -10 },
      { x: 10, z: 10 },
    ],
  };
};

/** Poussée : couloir strictement symétrique, ligne centrale et barricades miroir. */
const push: LayoutFn = (b, rng, arch) => {
  slab(b, rng, 13, 11);
  // Voie de progression, bordée.
  b.box(-13, GROUND_HEIGHT, -3, 27, 1, 7, 'accent', OVER);
  b.box(-13, GROUND_HEIGHT, -1, 27, 1, 3, 'highlight', OVER);
  // Marqueur central.
  b.box(-1, GROUND_HEIGHT, -1, 3, 5, 3, 'structure');
  b.box(-2, GROUND_HEIGHT + 5, -2, 5, 1, 5, 'accent', OVER);
  b.box(-1, GROUND_HEIGHT + 6, -1, 3, 1, 3, 'highlight', OVER);
  // Décor miroir en x — c'est la signature du mode. Le bâti est repoussé sur les
  // bords : la voie centrale doit rester dégagée jusqu'au bout, sinon le mode ne
  // se lit plus sur une vignette.
  const heights = [rng.int(3, 5), rng.int(4, 6)];
  for (const side of [-1, 1]) {
    building(b, rng, arch, side * 7, 9, 5, 4, heights[0]);
    building(b, rng, arch, side * 12, 6, 4, 4, heights[1]);
    building(b, rng, arch, side * 11, -8, 4, 4, heights[0]);
    // Barricades de part et d'autre de la voie.
    for (const z of [-1, 1]) b.box(side * 4, GROUND_HEIGHT, z * 4, 2, 3, 2, 'structure', OVER);
  }
  return {
    anchors: [
      { x: 0, z: -6 },
      { x: -12, z: 9 },
      { x: 12, z: 9 },
    ],
  };
};

/** Point chaud : trois îlots reliés par des passerelles. */
const flashpoint: LayoutFn = (b, rng, arch) => {
  const isles: Anchor[] = [
    { x: 0, z: -10 },
    { x: -10, z: 7 },
    { x: 10, z: 7 },
  ];
  for (const isle of isles) {
    plate(b, rng, isle.x, isle.z, 6.4);
    b.ring(isle.x, isle.z, 6, 1.4, GROUND_HEIGHT, 1, 'accent');
    b.disc(isle.x, isle.z, 2.6, GROUND_HEIGHT, 1, 'highlight');
  }
  // Passerelles : tablier accent, garde-corps clairs, piles au milieu.
  for (let i = 0; i < isles.length; i += 1) {
    const from = isles[i];
    const to = isles[(i + 1) % isles.length];
    b.path(from, to, 4, GROUND_HEIGHT, 1, 'accent', OVER);
    b.path(from, to, 2, GROUND_HEIGHT + 1, 1, 'highlight', OVER);
    const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
    b.box(Math.round(mid.x) - 1, 0, Math.round(mid.z) - 1, 3, GROUND_HEIGHT, 3, 'structure');
  }
  building(b, rng, arch, isles[1].x - 3, isles[1].z - 3, 4, 4, rng.int(4, 6));
  building(b, rng, arch, isles[2].x + 3, isles[2].z - 3, 4, 4, rng.int(4, 6));
  return { anchors: isles.map((p) => ({ x: p.x, z: p.z })) };
};

/** Repli générique (jeux sans typologie de map) : deux sites et un milieu. */
const standard: LayoutFn = (b, rng, arch) => {
  slab(b, rng, 13, 11);
  for (const side of [-1, 1]) {
    b.box(side * 9 - 3, GROUND_HEIGHT, side * 5 - 3, 7, 2, 7, 'structure');
    b.box(side * 9 - 3, GROUND_HEIGHT + 2, side * 5 - 3, 7, 1, 7, 'accent', OVER);
    b.box(side * 9 - 1, GROUND_HEIGHT + 3, side * 5 - 1, 3, 1, 3, 'highlight', OVER);
  }
  b.box(-2, GROUND_HEIGHT, -2, 5, 3, 5, 'structure');
  b.box(-2, GROUND_HEIGHT + 3, -2, 5, 1, 5, 'accent', OVER);
  building(b, rng, arch, -10, 8, 6, 5, rng.int(4, 7));
  building(b, rng, arch, 10, -8, 6, 5, rng.int(4, 7));
  return {
    anchors: [
      { x: -11, z: -7 },
      { x: 11, z: 9 },
      { x: 0, z: 10 },
    ],
  };
};

const LAYOUTS: Record<MapRecipe['layout'], LayoutFn> = {
  control,
  escort,
  hybrid,
  push,
  flashpoint,
  standard,
};

export function buildLayout(recipe: MapRecipe, b: SceneBuilder, rng: Rng): LayoutResult {
  return LAYOUTS[recipe.layout](b, rng, recipe.architecture ?? 'modern');
}

/**
 * Nappe qui entoure le terrain (mer, sable, neige…). Posée APRÈS le layout, deux
 * crans sous la surface jouable : le bord effrité du sol devient une côte, et la
 * maquette cesse de flotter dans le vide.
 */
export function buildEnvironment(b: SceneBuilder, recipe: MapRecipe): void {
  const env = recipe.environment;
  if (!env) return;
  const radius = env.radius ?? 21;
  const r = Math.ceil(radius);
  for (let x = -r; x <= r; x += 1) {
    for (let z = -r; z <= r; z += 1) {
      const d = Math.hypot(x, z);
      if (d > radius) continue;
      if (b.columnTop(x, z) !== 0) continue;
      // Écume / rive : la bande au contact du terrain est plus claire.
      const near =
        b.columnTop(x + 1, z) > 0 ||
        b.columnTop(x - 1, z) > 0 ||
        b.columnTop(x, z + 1) > 0 ||
        b.columnTop(x, z - 1) > 0;
      b.box(x, 0, z, 1, 1, 1, 'environment', {
        shade: near ? 0.3 : patchShade(x, z) * 0.6,
      });
    }
  }
}
