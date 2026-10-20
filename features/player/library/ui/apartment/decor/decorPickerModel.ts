// features/player/library/ui/apartment/decor/decorPickerModel.ts — logique
// PURE du choix du décor (lot 12 de docs/PLAN-womens-library.md) : les choix
// de chaque emplacement (sol, murs, fenêtres, porte), les ambiances, et la
// mise en page des vignettes à partir des sprites du manifeste.
//
// Les listes sont celles de config/library/decor.ts (copie synchronisée de
// l'API) : le site ne propose que ce que l'API accepte. N'importe du moteur
// que des TYPES (le moteur reste dans son chunk `next/dynamic`) : les quelques
// lignes de projection utiles aux vignettes sont refaites ici.

import {
  LIBRARY_DECOR_THEME_KEYS,
  LIBRARY_DECOR_THEMES,
  LIBRARY_DOORS,
  LIBRARY_FLOORS,
  LIBRARY_WALL_FINISHES,
  LIBRARY_WINDOWS,
  type LibraryDecorChoice,
  type LibraryDecorTheme,
  libraryDoorVariant,
  libraryWindowVariant,
  resolveApartmentDecor,
} from '@/config/library/decor';
import type { LibraryManifest } from '../../../engine/assets';
import type { WallVariant } from '../../../engine/decor';

export type DecorSlot = 'floor' | 'finish' | 'window' | 'door';
export const DECOR_SLOTS: readonly DecorSlot[] = [
  'floor',
  'finish',
  'window',
  'door',
];

/** Les valeurs proposées pour un emplacement, dans l'ordre de la config. */
export function slotOptions(slot: DecorSlot): readonly string[] {
  switch (slot) {
    case 'floor':
      return LIBRARY_FLOORS;
    case 'finish':
      return LIBRARY_WALL_FINISHES;
    case 'window':
      return LIBRARY_WINDOWS;
    case 'door':
      return LIBRARY_DOORS;
  }
}

/** Le décor choisi d'une salle (décor du lot 4 compris, valeurs inconnues → défaut). */
export function decorChoiceOf(raw: unknown): LibraryDecorChoice {
  const { floor, finish, window, door } = resolveApartmentDecor(raw);
  return { floor, finish, window, door };
}

/** Le choix avec une autre valeur pour un emplacement (valeur hors liste ignorée). */
export function withSlot(
  choice: LibraryDecorChoice,
  slot: DecorSlot,
  value: string
): LibraryDecorChoice {
  if (!slotOptions(slot).includes(value)) return choice;
  return { ...choice, [slot]: value } as LibraryDecorChoice;
}

export function sameChoice(a: LibraryDecorChoice, b: LibraryDecorChoice) {
  return DECOR_SLOTS.every((s) => a[s] === b[s]);
}

export function themeChoice(theme: LibraryDecorTheme): LibraryDecorChoice {
  return { ...LIBRARY_DECOR_THEMES[theme] };
}

/** L'ambiance qui correspond exactement au choix, ou null. */
export function themeOf(choice: LibraryDecorChoice): LibraryDecorTheme | null {
  return (
    LIBRARY_DECOR_THEME_KEYS.find((k) => sameChoice(choice, themeChoice(k))) ??
    null
  );
}

/* ---------------------------------------------------------- vignettes --- */

// Projection du moteur (engine/projection.ts) : une case = losange 64 × 32 px
// CSS, un mètre vertical ≈ 78,38 px.
const TILE_W = 64;
const TILE_H = 32;
const Z_PX = Math.cos(Math.PI / 6) * (TILE_W / (Math.SQRT2 * 0.5));

/** Une image posée dans une vignette, en px CSS du monde. */
export type ThumbLayer = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Vignette d'un mur : les images, leur boîte, et le point à mettre au centre
 * du cadre (`focus`, px CSS dans la boîte).
 */
export type WallThumb = {
  width: number;
  height: number;
  layers: ThumbLayer[];
  focus: { x: number; y: number };
};

/** Vignette d'un sol : la cellule du motif, à répéter. */
export type FloorThumb = {
  src: string;
  /** Taille d'une cellule en px CSS. */
  width: number;
  height: number;
  /** Ancre de la cellule en px CSS (sommet haut de la case 0, 0). */
  anchorX: number;
};

const screen = (gx: number, gy: number, z = 0) => ({
  x: (gx - gy) * (TILE_W / 2),
  y: (gx + gy) * (TILE_H / 2) - z * Z_PX,
});

export function floorThumb(
  manifest: LibraryManifest | null,
  floor: string
): FloorThumb | null {
  const f =
    manifest && Object.hasOwn(manifest.decor.floors, floor)
      ? manifest.decor.floors[floor]
      : null;
  if (!f || !manifest) return null;
  const pr = manifest.pixelRatio;
  return {
    src: f.src,
    width: f.width / pr,
    height: f.height / pr,
    anchorX: f.anchor.x / pr,
  };
}

function place(
  v: WallVariant,
  origin: { x: number; y: number },
  pr: number
): ThumbLayer {
  return {
    src: v.src,
    left: origin.x - v.anchor.x / pr,
    top: origin.y - v.anchor.y / pr,
    width: v.width / pr,
    height: v.height / pr,
  };
}

function normalize(
  layers: ThumbLayer[],
  focus: { x: number; y: number }
): WallThumb | null {
  if (layers.length === 0) return null;
  const x0 = Math.min(...layers.map((l) => l.left));
  const y0 = Math.min(...layers.map((l) => l.top));
  const x1 = Math.max(...layers.map((l) => l.left + l.width));
  const y1 = Math.max(...layers.map((l) => l.top + l.height));
  return {
    width: x1 - x0,
    height: y1 - y0,
    layers: layers.map((l) => ({ ...l, left: l.left - x0, top: l.top - y0 })),
    focus: { x: focus.x - x0, y: focus.y - y0 },
  };
}

/**
 * Un coin de la pièce dans un habillage : deux cases simples de chaque mur
 * (le droit d'abord, comme le moteur), centré sur le coin à 1,4 m.
 */
export function finishThumb(
  manifest: LibraryManifest | null,
  finish: string
): WallThumb | null {
  const style =
    manifest && Object.hasOwn(manifest.decor.walls, finish)
      ? manifest.decor.walls[finish]
      : null;
  if (!style || !manifest) return null;
  const pr = manifest.pixelRatio;
  const layers: ThumbLayer[] = [];
  for (let at = 0; at < 2; at++)
    layers.push(place(style.right.plain, screen(at, 0), pr));
  for (let at = 0; at < 2; at++)
    layers.push(place(style.left.plain, screen(0, at), pr));
  return normalize(layers, screen(0, 0, 1.4));
}

/**
 * Une fenêtre ou une porte dans l'habillage choisi : la variante sur le mur
 * droit, suivie d'une case simple ; `none` = deux cases simples. Centré sur
 * la variante, à hauteur de fenêtre (1,6 m) ou de porte (1,1 m).
 */
export function openingThumb(
  manifest: LibraryManifest | null,
  finish: string,
  slot: 'window' | 'door',
  value: string
): WallThumb | null {
  const style =
    manifest && Object.hasOwn(manifest.decor.walls, finish)
      ? manifest.decor.walls[finish]
      : null;
  if (!style || !manifest) return null;
  const pr = manifest.pixelRatio;
  const name =
    slot === 'window'
      ? libraryWindowVariant(value as (typeof LIBRARY_WINDOWS)[number])
      : libraryDoorVariant(value as (typeof LIBRARY_DOORS)[number]);
  const variant =
    name && Object.hasOwn(style.right, name) ? style.right[name] : null;
  const layers: ThumbLayer[] = [];
  const span = variant ? variant.span : 2;
  if (variant) layers.push(place(variant, screen(0, 0), pr));
  else
    for (let at = 0; at < span; at++)
      layers.push(place(style.right.plain, screen(at, 0), pr));
  layers.push(place(style.right.plain, screen(span, 0), pr));
  const z = slot === 'window' ? 1.6 : 1.1;
  return normalize(layers, screen(span / 2, 0, z));
}

/**
 * Échelle et décalage d'une vignette de mur dans un cadre de boxW × boxH px :
 * la largeur `focusWidth` remplit le cadre (la bande entière est centrée en
 * largeur), le point d'intérêt est centré en hauteur (le cadre coupe le haut
 * et le bas du mur).
 */
export function fitWallThumb(
  thumb: WallThumb,
  boxW: number,
  boxH: number,
  focusWidth: number
): { scale: number; x: number; y: number } {
  const scale = Math.min(boxW / Math.max(1, focusWidth), 2);
  return {
    scale,
    x: (boxW - thumb.width * scale) / 2,
    y: boxH / 2 - thumb.focus.y * scale,
  };
}
