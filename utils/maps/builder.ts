// utils/maps/builder.ts
// Petit constructeur de volumes voxel. Accumule des briques dans une Map indexée
// par coordonnée, ce qui donne gratuitement la déduplication (une brique posée
// deux fois au même endroit ne compte qu'une fois) et un test d'occupation O(1)
// dont le rendu iso a besoin pour le face culling.
//
// Toutes les coordonnées sont des ENTIERS ; les helpers arrondissent, ce qui
// permet aux layouts de raisonner en flottants (rayons, interpolations de
// chemin) sans se soucier de la grille.

import type { Brick, BrickRole } from './types';

export type PlaceOptions = {
  /** Variation de teinte déterministe (-1..1). */
  shade?: number;
  /** Ne pose la brique que si la case est libre (défaut : true). */
  keepExisting?: boolean;
};

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export class SceneBuilder {
  private readonly cells = new Map<string, Brick>();

  place(x: number, y: number, z: number, role: BrickRole, opts: PlaceOptions = {}): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    if (iy < 0) return;
    const k = key(ix, iy, iz);
    if (opts.keepExisting !== false && this.cells.has(k)) return;
    this.cells.set(k, { x: ix, y: iy, z: iz, role, shade: opts.shade });
  }

  /** Brique posée à cette case, si elle existe. */
  get(x: number, y: number, z: number): Brick | undefined {
    return this.cells.get(key(Math.round(x), Math.round(y), Math.round(z)));
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(key(Math.round(x), Math.round(y), Math.round(z)));
  }

  /** Hauteur de la première case libre au-dessus de la colonne (x, z). */
  columnTop(x: number, z: number, maxY = 64): number {
    const ix = Math.round(x);
    const iz = Math.round(z);
    for (let y = maxY; y >= 0; y -= 1) {
      if (this.cells.has(key(ix, y, iz))) return y + 1;
    }
    return 0;
  }

  /** Pavé plein. `w`/`d` sont les tailles en x/z, `h` la hauteur. */
  box(
    x0: number,
    y0: number,
    z0: number,
    w: number,
    h: number,
    d: number,
    role: BrickRole,
    opts: PlaceOptions = {},
  ): void {
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < h; y += 1) {
        for (let z = 0; z < d; z += 1) {
          this.place(x0 + x, y0 + y, z0 + z, role, opts);
        }
      }
    }
  }

  /** Pavé creux : seules les parois verticales sont posées (murs d'un bâtiment). */
  shell(
    x0: number,
    y0: number,
    z0: number,
    w: number,
    h: number,
    d: number,
    role: BrickRole,
    opts: PlaceOptions = {},
  ): void {
    for (let x = 0; x < w; x += 1) {
      for (let z = 0; z < d; z += 1) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (!edge) continue;
        for (let y = 0; y < h; y += 1) this.place(x0 + x, y0 + y, z0 + z, role, opts);
      }
    }
  }

  /** Cylindre à section circulaire, centré sur (cx, cz). */
  disc(
    cx: number,
    cz: number,
    radius: number,
    y0: number,
    h: number,
    role: BrickRole,
    opts: PlaceOptions = {},
  ): void {
    const r = Math.ceil(radius);
    for (let x = -r; x <= r; x += 1) {
      for (let z = -r; z <= r; z += 1) {
        if (x * x + z * z > radius * radius) continue;
        for (let y = 0; y < h; y += 1) this.place(cx + x, y0 + y, cz + z, role, opts);
      }
    }
  }

  /** Anneau (couronne circulaire) — sert aux rebords de plateformes. */
  ring(
    cx: number,
    cz: number,
    radius: number,
    thickness: number,
    y0: number,
    h: number,
    role: BrickRole,
    opts: PlaceOptions = {},
  ): void {
    const inner = radius - thickness;
    const r = Math.ceil(radius);
    for (let x = -r; x <= r; x += 1) {
      for (let z = -r; z <= r; z += 1) {
        const d2 = x * x + z * z;
        if (d2 > radius * radius || d2 < inner * inner) continue;
        for (let y = 0; y < h; y += 1) this.place(cx + x, y0 + y, cz + z, role, opts);
      }
    }
  }

  /** Segment épais entre deux points du plan (x, z) — sert aux chemins et ponts. */
  path(
    from: { x: number; z: number },
    to: { x: number; z: number },
    width: number,
    y0: number,
    h: number,
    role: BrickRole,
    opts: PlaceOptions = {},
  ): void {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) * 2));
    const half = (width - 1) / 2;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const cx = from.x + dx * t;
      const cz = from.z + dz * t;
      for (let ox = -half; ox <= half; ox += 1) {
        for (let oz = -half; oz <= half; oz += 1) {
          for (let y = 0; y < h; y += 1) this.place(cx + ox, y0 + y, cz + oz, role, opts);
        }
      }
    }
  }

  /** Retire une brique. Les silhouettes s'en servent pour percer une ouverture. */
  carve(x: number, y: number, z: number): void {
    this.cells.delete(key(Math.round(x), Math.round(y), Math.round(z)));
  }

  /** Évide un pavé — arcades, portes, brèches. */
  carveBox(x0: number, y0: number, z0: number, w: number, h: number, d: number): void {
    for (let x = 0; x < w; x += 1) {
      for (let y = 0; y < h; y += 1) {
        for (let z = 0; z < d; z += 1) this.carve(x0 + x, y0 + y, z0 + z);
      }
    }
  }

  /** Nombre de cellules déjà posées — sert de marqueur pour `underpin`. */
  mark(): number {
    return this.cells.size;
  }

  /**
   * Comble le vide sous les briques posées depuis `mark`, jusqu'au niveau 0.
   *
   * WHY: une silhouette plus large que le terrain qui la porte (un amphithéâtre
   * au bord d'une plaque, un village qui déborde de son île) flotterait dans le
   * vide. Plutôt que de brider la taille des silhouettes ou de recadrer les
   * ancres à la main pour chaque layout, on laisse le décor créer son propre
   * promontoire — ce qui se lit comme un relief naturel.
   *
   * Ne s'applique QU'aux cellules ajoutées après le marqueur, et SEULEMENT sous
   * les colonnes qui reposent au niveau du sol (`baseY`). Sans cette seconde
   * condition, tout débord — linteau d'une arche, flèche d'une grue, tablier
   * d'un viaduc — se verrait couler un mur jusqu'en bas, et la silhouette
   * deviendrait un bloc plein.
   */
  underpin(
    from: number,
    baseY: number,
    role: BrickRole,
    shadeFor?: (x: number, z: number) => number,
  ): void {
    const lowest = new Map<string, Brick>();
    for (const brick of [...this.cells.values()].slice(from)) {
      const col = `${brick.x},${brick.z}`;
      const current = lowest.get(col);
      if (!current || brick.y < current.y) lowest.set(col, brick);
    }
    for (const brick of lowest.values()) {
      if (brick.y > baseY) continue; // débord en l'air : rien à soutenir
      for (let y = brick.y - 1; y >= 0; y -= 1) {
        const k = key(brick.x, y, brick.z);
        if (this.cells.has(k)) break;
        this.cells.set(k, {
          x: brick.x,
          y,
          z: brick.z,
          role,
          shade: shadeFor?.(brick.x, brick.z),
        });
      }
    }
  }

  toBricks(): Brick[] {
    return [...this.cells.values()];
  }

  get size(): number {
    return this.cells.size;
  }
}
