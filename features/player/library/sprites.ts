// features/player/library/sprites.ts — vignettes des panneaux de la Library
// (boutique, meubles, avatars) tirées du manifeste des sprites pré-rendus
// (engine/assets.ts). Pur, testé seul ; n'importe du moteur que des TYPES.
//
// Les vignettes sont des fonds CSS (une image, une position, une taille) :
// aucun canvas à monter dans un panneau, et l'image est la même que celle du
// moteur (déjà en cache quand on ouvre l'appartement).

import type { AvatarSheet } from './engine/avatarSprites';
import type { LibraryManifest, SpriteFrame } from './engine/assets';

/** `url("…")` sûr pour un chemin du manifeste (guillemets et retours échappés). */
export function cssUrl(src: string): string {
  return `url("${src.replace(/["\\\n\r]/g, (ch) => encodeURIComponent(ch))}")`;
}

/** Direction « vers la caméra » (engine/motion.ts : 0 = haut, sens horaire). */
export const FACING_CAMERA = 4;

/** Le sprite d'un meuble à une rotation, ou null (manifeste absent, clé inconnue). */
export function furnitureFrame(
  manifest: LibraryManifest | null | undefined,
  key: string,
  rotation = 0
): SpriteFrame | null {
  if (!manifest || !Object.hasOwn(manifest.furniture, key)) return null;
  return manifest.furniture[key].rotations[rotation] ?? null;
}

export type SpriteBox = {
  /** URL de la feuille ou de l'image. */
  src: string;
  /** Taille de la boîte affichée, px CSS. */
  width: number;
  height: number;
  /** Taille de fond (`background-size`), px CSS. */
  backgroundWidth: number;
  backgroundHeight: number;
  /** Décalage du fond (`background-position`), px CSS (≤ 0). */
  offsetX: number;
  offsetY: number;
};

/**
 * La première image d'attente, face à la caméra, d'un avatar (format empaqueté
 * d'engine/avatarSprites.ts : un rect par image dans la feuille de
 * l'animation), mise à la hauteur `height` (px CSS). Direction absente : son
 * miroir n'est pas tenté ici (une vignette retournée exigerait un
 * `transform`) — on prend la première direction rendue.
 */
export function avatarIdleBox(
  sheet: AvatarSheet | null | undefined,
  height: number
): SpriteBox | null {
  const idle = sheet?.animations.idle;
  if (!idle) return null;
  const rect = (idle.directions[FACING_CAMERA] ??
    Object.values(idle.directions)[0])?.[0];
  if (!rect || rect.h <= 0) return null;
  const k = height / rect.h;
  return {
    src: idle.sheet.src,
    width: Math.round(rect.w * k),
    height,
    backgroundWidth: idle.sheet.width * k,
    backgroundHeight: idle.sheet.height * k,
    offsetX: -rect.x * k,
    offsetY: -rect.y * k,
  };
}

/** La feuille d'un avatar du manifeste, ou null. */
export function avatarSheetOf(
  manifest: LibraryManifest | null | undefined,
  avatarId: string
): AvatarSheet | null {
  return manifest && Object.hasOwn(manifest.avatars, avatarId)
    ? manifest.avatars[avatarId]
    : null;
}
