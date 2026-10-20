// Feuilles de sprites d'avatars (section `avatars` du manifeste), format
// empaqueté (tools/library-assets/iso_pack.py).
//
// Chaque image est recadrée sur ses pixels visibles et rangée dans une
// feuille de 4096 px au plus (limite de texture des GPU mobiles) :
//   avatar     = { sheet, sheetWidth, sheetHeight, animations }
//   animation  = { fps, strideMeters?, directions: { "0".."7": [rect…] },
//                  sheet?, sheetWidth?, sheetHeight? }   (feuille propre)
//   rect       = { x, y, w, h, ax, ay } : boîte dans la feuille de
//                l'animation (la sienne, sinon celle de l'avatar), et ancre
//                au sol DANS la boîte, en px d'image (à pixelRatio).
// On pose l'image en écran(gx, gy) − (ax, ay) / pixelRatio, taille
// (w, h) / pixelRatio.
//
// `idle` et `walk` partagent la feuille de l'avatar ; `sit` a la sienne : le
// renderer ne demande une feuille au cache qu'au moment de dessiner une image
// qui s'y trouve, donc elle n'est chargée que si un avatar s'assoit.
//
// Le pipeline rend les 8 directions. Par robustesse, une direction absente
// prend la direction miroir (8 − d) mod 8, retournée horizontalement
// (ax → w − ax) ; si le miroir manque aussi, pas d'image : l'avatar retombe sur
// sa silhouette. Convention des directions : motion.ts (0 = haut de l'écran,
// sens horaire, 4 = vers la caméra).
//
// Marche : avec `strideMeters` (distance d'un cycle complet), l'image avance
// avec la DISTANCE parcourue — pas de glissade des pieds quelle que soit la
// vitesse ; sans, elle avance au temps, à `fps`. Attente et assise : au temps.
//
// Une entrée invalide (rect hors de sa feuille, ancre hors du rect, feuille
// plus grande que MAX_SHEET_PX…) est rejetée en bloc : silhouette.
//
// Ces feuilles d'avatars ENTIERS (a01…a12) restent le repli des avatars
// COMPOSÉS par calques (lot 13, avatarLayers.ts + lookCompositor.ts) : un
// look qu'on ne peut pas (encore) dessiner prend la feuille de son `avatarId`.

import { type Direction, mirrorDirection } from './motion';

/** Côté maximal d'une feuille (px) : limite de texture courante sur mobile. */
export const MAX_SHEET_PX = 4096;

export type AvatarRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ancre au sol dans le rect (px d'image). */
  ax: number;
  ay: number;
};

/** Une feuille d'image et sa taille annoncée (vérifiée au chargement). */
export type SheetRef = { src: string; width: number; height: number };

export type AvatarAnimation = {
  fps: number;
  /** Distance (m) couverte par un cycle complet. */
  strideMeters?: number;
  /** Feuille où se trouvent les rects (celle de l'avatar par défaut). */
  sheet: SheetRef;
  directions: Partial<Record<Direction, AvatarRect[]>>;
};

export type AvatarSheet = {
  sheet: SheetRef;
  /** `idle` obligatoire ; `walk` et `sit` retombent sur `idle`. */
  animations: Record<string, AvatarAnimation>;
};

export type AvatarPose = 'idle' | 'walk' | 'sit';

/** Image à découper, et ancre effective (après miroir). */
export type AvatarFrame = {
  src: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  anchorX: number;
  anchorY: number;
  mirrored: boolean;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number): v is number =>
  isNum(v) && Number.isInteger(v) && v >= min;
const isPositive = (v: unknown): v is number => isNum(v) && v > 0;

function parseSheetRef(
  src: unknown,
  width: unknown,
  height: unknown
): SheetRef | null {
  if (typeof src !== 'string' || !src) return null;
  if (!isInt(width, 1) || !isInt(height, 1)) return null;
  if (width > MAX_SHEET_PX || height > MAX_SHEET_PX) return null;
  return { src, width, height };
}

function parseRect(v: unknown, sheet: SheetRef): AvatarRect | null {
  if (!isObj(v)) return null;
  const { x, y, w, h, ax, ay } = v;
  if (!isInt(x, 0) || !isInt(y, 0) || !isInt(w, 1) || !isInt(h, 1)) return null;
  if (x + w > sheet.width || y + h > sheet.height) return null;
  if (!isNum(ax) || !isNum(ay) || ax < 0 || ax > w || ay < 0 || ay > h)
    return null;
  return { x, y, w, h, ax, ay };
}

function parseAnimation(v: unknown, avatar: SheetRef): AvatarAnimation | null {
  if (!isObj(v) || !isPositive(v.fps)) return null;
  if (v.strideMeters !== undefined && !isPositive(v.strideMeters)) return null;
  let sheet = avatar;
  if (v.sheet !== undefined) {
    const own = parseSheetRef(v.sheet, v.sheetWidth, v.sheetHeight);
    if (!own) return null;
    sheet = own;
  }
  if (!isObj(v.directions)) return null;
  const directions: Partial<Record<Direction, AvatarRect[]>> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(v.directions)) {
    if (!/^[0-7]$/.test(key)) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const rects = raw.map((r) => parseRect(r, sheet));
    if (rects.some((r) => r === null)) return null;
    directions[Number(key) as Direction] = rects as AvatarRect[];
    count++;
  }
  if (count === 0) return null;
  const a: AvatarAnimation = { fps: v.fps, sheet, directions };
  if (v.strideMeters !== undefined) a.strideMeters = v.strideMeters;
  return a;
}

/** Valide une entrée d'avatar ; null = entrée rejetée (silhouette). */
export function parseAvatarSheet(v: unknown): AvatarSheet | null {
  if (!isObj(v)) return null;
  const sheet = parseSheetRef(v.sheet, v.sheetWidth, v.sheetHeight);
  if (!sheet || !isObj(v.animations)) return null;
  const animations: Record<string, AvatarAnimation> = {};
  for (const [name, raw] of Object.entries(v.animations)) {
    const a = parseAnimation(raw, sheet);
    if (!a) return null;
    animations[name] = a;
  }
  if (!animations.idle) return null;
  return { sheet, animations };
}

/**
 * L'image chargée a-t-elle la taille annoncée ? Sinon la feuille est écartée :
 * on découperait à côté.
 */
export function sheetMatchesImage(
  sheet: SheetRef,
  img: { naturalWidth: number; naturalHeight: number }
): boolean {
  return img.naturalWidth === sheet.width && img.naturalHeight === sheet.height;
}

/** Animation jouée pour une pose (repli sur `idle`). */
export function animationFor(
  sheet: AvatarSheet,
  pose: AvatarPose
): { name: string; anim: AvatarAnimation } {
  const a = pose === 'idle' ? undefined : sheet.animations[pose];
  return a
    ? { name: pose, anim: a }
    : { name: 'idle', anim: sheet.animations.idle };
}

/** Images de la direction d (miroir éventuel), ou null si ni d ni son miroir. */
export function resolveDirection(
  anim: AvatarAnimation,
  d: Direction
): { rects: AvatarRect[]; mirrored: boolean } | null {
  const exact = anim.directions[d];
  if (exact) return { rects: exact, mirrored: false };
  const mirror = anim.directions[mirrorDirection(d)];
  if (mirror) return { rects: mirror, mirrored: true };
  return null;
}

/**
 * Numéro d'image : à la distance (strideMeters) ou au temps (fps). Partagé
 * avec les avatars composés (avatarLayers.ts), qui avancent pareil.
 */
export function frameIndex(
  anim: Pick<AvatarAnimation, 'fps' | 'strideMeters'>,
  frames: number,
  byDistance: boolean,
  clock: { timeSec: number; travelledMeters: number }
): number {
  let f: number;
  if (byDistance && anim.strideMeters) {
    const s = anim.strideMeters;
    const t = ((clock.travelledMeters % s) + s) % s;
    f = Math.floor((t / s) * frames);
  } else {
    f = Math.floor(Math.max(0, clock.timeSec) * anim.fps);
  }
  return Math.min(frames - 1, f % frames);
}

/** Image à dessiner, ou null (direction introuvable : silhouette). */
export function avatarFrame(
  sheet: AvatarSheet,
  d: Direction,
  pose: AvatarPose,
  clock: { timeSec: number; travelledMeters: number }
): AvatarFrame | null {
  const { name, anim } = animationFor(sheet, pose);
  const dir = resolveDirection(anim, d);
  if (!dir) return null;
  const r =
    dir.rects[frameIndex(anim, dir.rects.length, name === 'walk', clock)];
  return {
    src: anim.sheet.src,
    sx: r.x,
    sy: r.y,
    sw: r.w,
    sh: r.h,
    anchorX: dir.mirrored ? r.w - r.ax : r.ax,
    anchorY: r.ay,
    mirrored: dir.mirrored,
  };
}

/** Rectangle écran (px du monde) d'une image posée par son ancre en `foot`. */
export function frameDestination(
  f: AvatarFrame,
  foot: { x: number; y: number },
  pixelRatio: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: foot.x - f.anchorX / pixelRatio,
    y: foot.y - f.anchorY / pixelRatio,
    w: f.sw / pixelRatio,
    h: f.sh / pixelRatio,
  };
}

/** Toutes les feuilles d'un avatar (vérification de taille au chargement). */
export function sheetsOf(sheet: AvatarSheet): SheetRef[] {
  const out = new Map<string, SheetRef>([[sheet.sheet.src, sheet.sheet]]);
  for (const a of Object.values(sheet.animations))
    out.set(a.sheet.src, a.sheet);
  return [...out.values()];
}
