// utils/maps/isoSvg.ts
// Rendu isométrique 2:1 d'une scène voxel en SVG. Pur, sans DOM ni canvas —
// donc utilisable en SSR, dans un script Node de pré-rendu, ou côté bot Discord.
//
// WHY SVG:
//   La grille du map pool affiche 20 à 30 maps. Monter autant de canvas WebGL
//   serait absurde. Le SVG isométrique donne 90 % du rendu pour 0 ko de bundle
//   JS, fonctionne sans JavaScript, s'inline dans un e-mail ou un embed, et
//   reste net à n'importe quelle densité d'écran. Le canvas 3D interactif
//   (rotation, animation de veto) viendra en complément, chargé à la demande.
//
// PROJECTION:
//   sx = (x - z) * tile/2        (+x part vers la droite-bas, +z vers la gauche-bas)
//   sy = (x + z) * tile/4 - y * cubeHeight
//   Les trois faces visibles sont donc : dessus (+y), droite (+x), gauche (+z).
//
// TAILLE DU FICHIER — trois leviers, dans l'ordre d'efficacité :
//   1) face culling : une face masquée par la brique voisine n'est pas émise
//      (~85 % des faces disparaissent) ;
//   2) fusion des faces du dessus contiguës le long de x quand elles partagent
//      la même couleur — c'est ce qui absorbe le sol et la nappe d'environnement,
//      qui dominent sinon le fichier ; les teintes du sol sont donc posées par
//      PLAQUES (cf. patchShade dans layouts.ts) et non cellule par cellule ;
//   3) trois `<path>` unitaires en `<defs>`, réinstanciés par `<use>`.
//   Les éléments sont émis dans l'ordre du peintre, on ne peut donc PAS les
//   regrouper par couleur : cela casserait l'occultation. Un run fusionné est
//   émis à la profondeur de sa PREMIÈRE cellule — tout ce qui peut le masquer a
//   une profondeur supérieure, donc passe après.
//
// INTÉGRATION:
//   Servir via `<img src="…/map.svg">` plutôt qu'en inline : quelques milliers
//   d'éléments par maquette, c'est négligeable pour un rasterizer mais lourd
//   dans le DOM si on en met trente sur une page.

import type { Brick, BrickRole, MapMood, MapRecipe, VoxelScene } from './types';

export type IsoSvgOptions = {
  /** Largeur d'une tuile en px. La hauteur de la face du dessus vaut la moitié. */
  tile?: number;
  /** Hauteur d'une brique en px. */
  cubeHeight?: number;
  /** Marge minimale autour de la maquette, en px. */
  padding?: number;
  /**
   * Ratio largeur/hauteur imposé au viewBox. La boîte est élargie
   * symétriquement pour l'atteindre, de sorte que le SVG remplisse son
   * conteneur sans bandes ni recadrage CSS. Défaut 16/10. `null` = au plus juste.
   */
  aspect?: number | null;
  /** Losange en relief sur les faces du dessus (aspect « brique »). Défaut true. */
  studs?: boolean;
  /** Fond dégradé dépendant de l'ambiance. Défaut true. */
  background?: boolean;
  /** Contenu de <title> (accessibilité). Défaut : le nom de la map. */
  title?: string;
  /** Rendu décoratif : masque l'élément aux lecteurs d'écran. Défaut false. */
  decorative?: boolean;
};

/** Éclairement par face — c'est ce qui donne le volume sur un aplat. */
const FACE_LIGHT = { top: 1, right: 0.74, left: 0.5 } as const;

/**
 * Ambiance : teinte globale appliquée aux briques + couleurs de fond.
 * `mix` reste faible volontairement — au-delà de ~0.15 la palette de la map
 * disparaît sous la teinte et toutes les maps de nuit se ressemblent. Le
 * contraste de nuit vient du CIEL sombre, pas d'un voile sur les briques.
 */
const MOODS: Record<MapMood, { tint: [number, number, number]; mix: number; sky: [string, string] }> =
  {
    day: { tint: [255, 250, 235], mix: 0.06, sky: ['#e3edf6', '#b3c6db'] },
    dusk: { tint: [255, 170, 105], mix: 0.12, sky: ['#f7cb95', '#7d4f74'] },
    night: { tint: [120, 150, 225], mix: 0.13, sky: ['#1c2545', '#080b16'] },
  };

function colorForRole(role: BrickRole, recipe: MapRecipe): string {
  switch (role) {
    case 'ground':
      return recipe.palette[0];
    case 'structure':
      return recipe.palette[1];
    case 'accent':
      return recipe.palette[2];
    case 'highlight':
      return recipe.palette[3];
    case 'environment':
      // La nappe n'appartient pas au bâti : sa couleur vient de la recette, et
      // à défaut du sol (une nappe absente ne doit jamais rendre du noir).
      return recipe.environment?.color ?? recipe.palette[0];
  }
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));
const toHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;

function shadeColor(base: string, light: number, variation: number, mood: MapMood): string {
  const [r, g, b] = parseHex(base);
  const { tint, mix } = MOODS[mood];
  const k = light * (1 + variation);
  return toHex([
    r * k * (1 - mix) + tint[0] * mix * light,
    g * k * (1 - mix) + tint[1] * mix * light,
    b * k * (1 - mix) + tint[2] * mix * light,
  ]);
}

const escapeXml = (s: string): string => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Clé d'occupation — doit rester identique à celle du SceneBuilder. */
const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export function renderIsoSvg(scene: VoxelScene, options: IsoSvgOptions = {}): string {
  const tile = options.tile ?? 16;
  const cubeHeight = options.cubeHeight ?? 10;
  const padding = options.padding ?? 14;
  const aspect = options.aspect === undefined ? 16 / 10 : options.aspect;
  const withStuds = options.studs ?? true;
  const withBackground = options.background ?? true;
  const mood: MapMood = scene.recipe.mood ?? 'day';

  const hw = tile / 2;
  const hh = tile / 4;

  const byCell = new Map<string, Brick>();
  for (const brick of scene.bricks) byCell.set(cellKey(brick.x, brick.y, brick.z), brick);
  const occupied = (x: number, y: number, z: number): boolean => byCell.has(cellKey(x, y, z));

  // Ordre du peintre : du fond vers l'avant.
  const sorted: Brick[] = [...scene.bricks].sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z));

  const parts: string[] = [];
  let minSx = Infinity;
  let maxSx = -Infinity;
  let minSy = Infinity;
  let maxSy = -Infinity;

  const project = (x: number, y: number, z: number): [number, number] => [
    Math.round((x - z) * hw),
    Math.round((x + z) * hh - y * cubeHeight),
  ];

  const track = (sx: number, sy: number): void => {
    if (sx - hw < minSx) minSx = sx - hw;
    if (sx + hw > maxSx) maxSx = sx + hw;
    if (sy - hh < minSy) minSy = sy - hh;
    if (sy + hh + cubeHeight > maxSy) maxSy = sy + hh + cubeHeight;
  };

  /** Deux briques fusionnent si leur face du dessus aura exactement la même couleur. */
  const sameFill = (a: Brick, b: Brick): boolean =>
    a.role === b.role && (a.shade ?? 0) === (b.shade ?? 0);
  const topVisible = (b: Brick): boolean => !occupied(b.x, b.y + 1, b.z);

  for (const brick of sorted) {
    const { x, y, z } = brick;
    const topHidden = !topVisible(brick);
    const rightHidden = occupied(x + 1, y, z);
    const leftHidden = occupied(x, y, z + 1);
    if (topHidden && rightHidden && leftHidden) continue;

    const [sx, sy] = project(x, y, z);
    track(sx, sy);

    const base = colorForRole(brick.role, scene.recipe);
    const variation = brick.shade ?? 0;

    // L'ordre d'émission des faces d'une même brique n'a pas d'importance :
    // elles ne se recouvrent jamais entre elles.
    if (!leftHidden) {
      parts.push(
        `<use href="#l" x="${sx}" y="${sy}" fill="${shadeColor(base, FACE_LIGHT.left, variation, mood)}"/>`,
      );
    }
    if (!rightHidden) {
      parts.push(
        `<use href="#r" x="${sx}" y="${sy}" fill="${shadeColor(base, FACE_LIGHT.right, variation, mood)}"/>`,
      );
    }
    if (topHidden) continue;

    // La cellule précédente en x porte déjà ce run : rien à émettre.
    const prev = byCell.get(cellKey(x - 1, y, z));
    if (prev && topVisible(prev) && sameFill(prev, brick)) continue;

    let last = brick;
    for (let n = 1; ; n += 1) {
      const nextBrick = byCell.get(cellKey(x + n, y, z));
      if (!nextBrick || !topVisible(nextBrick) || !sameFill(nextBrick, brick)) break;
      last = nextBrick;
    }

    const topFill = shadeColor(base, FACE_LIGHT.top, variation, mood);
    if (last === brick) {
      parts.push(`<use href="#t" x="${sx}" y="${sy}" fill="${topFill}"/>`);
    } else {
      const [ex, ey] = project(last.x, last.y, last.z);
      track(ex, ey);
      parts.push(
        `<path fill="${topFill}" d="M${sx - hw} ${sy}L${sx} ${sy - hh}L${ex + hw} ${ey}L${ex} ${ey + hh}Z"/>`,
      );
    }

    // Les tenons ne sont posés que sur le bâti : sol et nappe restent lisses
    // (plaque de base), ce qui économise la majorité des éléments.
    if (withStuds && brick.role !== 'ground' && brick.role !== 'environment') {
      const studFill = shadeColor(base, FACE_LIGHT.top * 1.13, variation, mood);
      for (let cx = brick.x; cx <= last.x; cx += 1) {
        const [ux, uy] = project(cx, y, z);
        parts.push(`<use href="#s" x="${ux}" y="${uy}" fill="${studFill}"/>`);
      }
    }
  }

  if (!Number.isFinite(minSx)) {
    minSx = 0;
    maxSx = tile;
    minSy = 0;
    maxSy = tile;
  }

  let vbX = minSx - padding;
  let vbY = minSy - padding;
  let vbW = maxSx - minSx + padding * 2;
  let vbH = maxSy - minSy + padding * 2;

  // Élargissement symétrique jusqu'au ratio demandé : la maquette reste centrée
  // et le SVG remplit son conteneur sans recadrage CSS.
  if (aspect) {
    if (vbW / vbH < aspect) {
      const target = vbH * aspect;
      vbX -= (target - vbW) / 2;
      vbW = target;
    } else {
      const target = vbW / aspect;
      vbY -= (target - vbH) / 2;
      vbH = target;
    }
  }
  vbX = Math.round(vbX);
  vbY = Math.round(vbY);
  vbW = Math.round(vbW);
  vbH = Math.round(vbH);

  // Faces unitaires, ancrées sur le centre de la face du dessus.
  const top = `M0 ${-hh}L${hw} 0L0 ${hh}L${-hw} 0Z`;
  const right = `M0 ${hh}L${hw} 0L${hw} ${cubeHeight}L0 ${hh + cubeHeight}Z`;
  const left = `M0 ${hh}L${-hw} 0L${-hw} ${cubeHeight}L0 ${hh + cubeHeight}Z`;
  // Losange en relief : évoque la brique de construction sans reprendre le tenon
  // cylindrique caractéristique d'un fabricant de jouets déposé.
  const stud = `M0 ${-hh * 0.44}L${hw * 0.44} 0L0 ${hh * 0.44}L${-hw * 0.44} 0Z`;

  const sky = MOODS[mood].sky;
  const bg = withBackground
    ? `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/>` +
      `</linearGradient>`
    : '';
  const bgRect = withBackground
    ? `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="url(#sky)"/>`
    : '';

  const label = escapeXml(options.title ?? scene.recipe.name);
  const a11y = options.decorative
    ? ' aria-hidden="true" focusable="false"'
    : ` role="img" aria-label="${label}"`;
  const titleTag = options.decorative ? '' : `<title>${label}</title>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}"` +
    ` preserveAspectRatio="xMidYMid meet"${a11y}>` +
    titleTag +
    `<defs>${bg}` +
    `<path id="t" d="${top}"/><path id="r" d="${right}"/><path id="l" d="${left}"/>` +
    (withStuds ? `<path id="s" d="${stud}"/>` : '') +
    `</defs>` +
    bgRect +
    parts.join('') +
    `</svg>`
  );
}
