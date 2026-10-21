// OÙ et COMMENT un avatar est dessiné (lot 15) : debout sur sa case (marche,
// attente), ou posé sur la place d'un meuble (assise, assise basse,
// allongée), décalé de la différence entre la hauteur du meuble et celle du
// rendu (`restLift`). Sa boîte (pour le viser, trier les pseudos) et sa tête
// (pseudo, bulle) en suivent la pose. PUR.
//
// La pose MESURÉE est celle que le renderer a réellement dessinée à la
// dernière image (`renderedPose`, repli compris : `lie` → `sit`) ; avant toute
// image, la pose demandée.

import {
  type AvatarPose,
  isRestPose,
  REST_SURFACE_M,
  restLift,
} from './avatarSprites';
import type { Box3 } from './depthSort';
import { type Direction, isWalking, type Walker } from './motion';
import type { Posture } from './postures';
import { AVATAR_HEIGHT, AVATAR_RADIUS } from './room';
import { metersToTiles } from './projection';

/** Ce que le stance lit d'un avatar (posture absente : debout). */
export type StanceSubject = {
  walker: Walker;
  posture?: Posture | null;
  renderedPose?: AvatarPose | null;
};

export type Stance = {
  x: number;
  y: number;
  /** La pose demandée. */
  pose: AvatarPose;
  dir: Direction;
  /** Hauteur de l'assise / du couchage (m) ; null : debout. */
  surfaceM: number | null;
};

export function stanceOf(a: StanceSubject): Stance {
  const p = a.posture;
  const w = a.walker;
  if (p && p.kind === 'seat')
    return { x: p.x, y: p.y, pose: p.pose, dir: p.dir, surfaceM: p.surfaceM };
  return {
    x: w.x,
    y: w.y,
    pose: isWalking(w) ? 'walk' : 'idle',
    dir: w.dir,
    surfaceM: null,
  };
}

/** Le haut du crâne au-dessus du sol du rendu, par pose de repos (m). */
const REST_TOP_M = { sit: 1.33, sit_low: 1.05, lie: 0.85 } as const;
/**
 * Allongée (mesuré sur le rendu) : du bassin au sommet du crâne (cheveux
 * compris), et au bout des chaussures (cases).
 */
const LIE_HEAD = metersToTiles(0.79);
const LIE_FEET = metersToTiles(0.97);

function measured(a: StanceSubject, s: Stance): AvatarPose {
  if (s.surfaceM === null) return s.pose;
  const drawn = a.renderedPose;
  return drawn ? drawn : s.pose;
}

/** Le décalage vertical de l'image (m) : 0 debout. */
export function stanceLift(a: StanceSubject): number {
  const s = stanceOf(a);
  return s.surfaceM === null ? 0 : restLift(s.surfaceM, measured(a, s));
}

/** Le haut de la tête (m, décalage compris). */
export function stanceTopM(a: StanceSubject): number {
  const s = stanceOf(a);
  const pose = measured(a, s);
  if (s.surfaceM === null || !isRestPose(pose)) return AVATAR_HEIGHT;
  return REST_TOP_M[pose] + restLift(s.surfaceM, pose);
}

/** La boîte de l'avatar : debout, un pavé de 1,65 m ; allongée, le long du corps. */
export function stanceBox(a: StanceSubject): Box3 {
  const s = stanceOf(a);
  const pose = measured(a, s);
  const top = stanceTopM(a);
  const r = AVATAR_RADIUS;
  if (s.surfaceM === null || !isRestPose(pose))
    return {
      minX: s.x - r,
      maxX: s.x + r,
      minY: s.y - r,
      maxY: s.y + r,
      minZ: 0,
      maxZ: top,
    };
  const lift = restLift(s.surfaceM, pose);
  if (pose !== 'lie')
    return {
      minX: s.x - r,
      maxX: s.x + r,
      minY: s.y - r,
      maxY: s.y + r,
      minZ: lift,
      maxZ: top,
    };
  // Les pieds vers `dir` (un axe de la grille : 1, 3, 5 ou 7).
  const fx = s.dir === 3 ? 1 : s.dir === 7 ? -1 : 0;
  const fy = s.dir === 5 ? 1 : s.dir === 1 ? -1 : 0;
  const xs = [s.x + fx * LIE_FEET, s.x - fx * LIE_HEAD];
  const ys = [s.y + fy * LIE_FEET, s.y - fy * LIE_HEAD];
  return {
    minX: Math.min(...xs) - (fx ? 0 : r),
    maxX: Math.max(...xs) + (fx ? 0 : r),
    minY: Math.min(...ys) - (fy ? 0 : r),
    maxY: Math.max(...ys) + (fy ? 0 : r),
    minZ: REST_SURFACE_M.lie + lift - 0.05,
    maxZ: top,
  };
}
