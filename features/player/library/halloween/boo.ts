// features/player/library/halloween/boo.ts — LE « BOUH ! » du fantôme
// d'Halloween (lot 16 de docs/PLAN-womens-library.md).
//
// Quand le fantôme passe tout près d'une joueuse (≤ 1,5 m), il lui fait
// « Bouh ! » dans une bulle, puis attend 25 s avant de recommencer avec ELLE
// (une autre, croisée entre-temps, a droit au sien). Chaque navigateur le
// calcule pour les avatars qu'il voit, le sien compris : rien ne passe par le
// réseau, ce n'est qu'un clin d'œil.
//
// Module PUR : l'instant et la mémoire des derniers « bouh » sont des
// paramètres, la nouvelle mémoire est rendue (l'appelant la garde d'une image
// à l'autre). Positions en coordonnées continues de grille (cases de 0,5 m).

import { METERS_PER_TILE } from '../engine/projection';

/** Distance (m) sous laquelle le fantôme fait « bouh ». */
export const BOO_RADIUS_M = 1.5;
/** Attente (ms) entre deux « bouh » pour la même joueuse. */
export const BOO_COOLDOWN_MS = 25_000;

/** Une avatar visible : son identifiant et sa position (cases). */
export type BooAvatar = { id: string; x: number; y: number };

/** Dernier « bouh » de chaque avatar (ms). Jamais modifiée en place. */
export type BooMemory = ReadonlyMap<string, number>;

export const EMPTY_BOO_MEMORY: BooMemory = new Map();

export type BooResult = {
  /** Les avatars qui reçoivent un « bouh » maintenant (ordre d'entrée). */
  boo: string[];
  /** La mémoire à garder pour l'image suivante. */
  memory: BooMemory;
};

/**
 * Qui reçoit un « bouh » à `nowMs` : les avatars à `radiusM` ou moins du
 * fantôme (au sol, sa hauteur de vol ne compte pas) dont le dernier « bouh »
 * date d'au moins `cooldownMs`. Sans fantôme (`ghost` null), personne. La
 * mémoire rendue oublie les « bouh » plus vieux que l'attente : elle ne
 * grossit pas avec les passages.
 */
export function booTargets(
  ghost: { x: number; y: number } | null,
  avatars: readonly BooAvatar[],
  nowMs: number,
  memory: BooMemory = EMPTY_BOO_MEMORY,
  options: { radiusM?: number; cooldownMs?: number } = {}
): BooResult {
  const radiusM = options.radiusM ?? BOO_RADIUS_M;
  const cooldownMs = options.cooldownMs ?? BOO_COOLDOWN_MS;
  const next = new Map<string, number>();
  for (const [id, at] of memory)
    if (nowMs - at < cooldownMs && at <= nowMs) next.set(id, at);
  const boo: string[] = [];
  if (ghost) {
    const reach = radiusM / METERS_PER_TILE;
    for (const a of avatars) {
      if (next.has(a.id) || boo.includes(a.id)) continue;
      if (Math.hypot(a.x - ghost.x, a.y - ghost.y) > reach) continue;
      boo.push(a.id);
      next.set(a.id, nowMs);
    }
  }
  // Rien de changé : la même mémoire (l'appelant peut comparer par `===`).
  const same =
    next.size === memory.size &&
    [...next].every(([id, at]) => memory.get(id) === at);
  return { boo, memory: same ? memory : next };
}
