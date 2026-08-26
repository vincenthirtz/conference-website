// utils/maps/rng.ts
// PRNG déterministe pour la génération des maquettes.
//
// WHY:
//   Une maquette doit être IDENTIQUE à chaque rendu : les images sont
//   pré-rendues et committées, et le canvas 3D doit afficher la même scène que
//   la vignette. `Math.random()` est donc proscrit — la graine est le slug de la
//   map, ce qui donne aussi de la variété « gratuite » entre deux maps qui
//   partagent layout et palette.
//
// mulberry32 : 32 bits d'état, très courte, distribution suffisante pour du
// placement décoratif (ce n'est pas de la crypto).

export type Rng = {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number;
  /** Flottant dans [min, max). */
  range(min: number, max: number): number;
  /** true avec la probabilité p. */
  chance(p: number): boolean;
  /** Élément au hasard (undefined si le tableau est vide). */
  pick<T>(items: readonly T[]): T | undefined;
};

/** Hash FNV-1a 32 bits — stable, pas de collision gênante sur nos slugs. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => (items.length === 0 ? undefined : items[Math.floor(next() * items.length)]),
  };
}
