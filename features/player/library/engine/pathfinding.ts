// A* sur la grille de la salle : 8 voisins, sans couper les coins.
//
// Un pas en diagonale n'est permis que si les DEUX cases orthogonales qu'il
// longe sont libres : un avatar ne se glisse pas entre deux meubles qui se
// touchent par un coin, ni au ras de l'angle d'un rayonnage.
// Coûts : 1 en orthogonal, √2 en diagonal ; heuristique octile (admissible).

import type { Tile } from './projection';

export type WalkGrid = {
  w: number;
  d: number;
  /** 1 = case bloquée ; index = j × w + i. */
  blocked: Uint8Array;
};

export function createWalkGrid(w: number, d: number): WalkGrid {
  return { w, d, blocked: new Uint8Array(w * d) };
}

export function isWalkable(grid: WalkGrid, i: number, j: number): boolean {
  return (
    i >= 0 &&
    j >= 0 &&
    i < grid.w &&
    j < grid.d &&
    grid.blocked[j * grid.w + i] === 0
  );
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

function octile(ai: number, aj: number, bi: number, bj: number): number {
  const dx = Math.abs(ai - bi);
  const dy = Math.abs(aj - bj);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/** Tas binaire minimal (f, puis h pour départager), suppression paresseuse. */
class OpenHeap {
  private nodes: number[] = [];
  private f: number[] = [];
  private h: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, f: number, h: number): void {
    this.nodes.push(node);
    this.f.push(f);
    this.h.push(h);
    this.up(this.nodes.length - 1);
  }

  pop(): number {
    const top = this.nodes[0];
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.nodes.pop();
    this.f.pop();
    this.h.pop();
    if (this.nodes.length) this.down(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    return (
      this.f[a] < this.f[b] ||
      (this.f[a] === this.f[b] && this.h[a] < this.h[b])
    );
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.h[a], this.h[b]] = [this.h[b], this.h[a]];
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) return;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.nodes.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
}

/**
 * Chemin de `start` à `goal`, bornes comprises ([start] si start = goal), ou
 * null si la cible est hors salle, bloquée ou inaccessible. La case de départ
 * peut être bloquée (avatar posé avant un meuble) : on peut toujours en sortir.
 */
export function findPath(
  grid: WalkGrid,
  start: Tile,
  goal: Tile
): Tile[] | null {
  const { w, d } = grid;
  if (start.i < 0 || start.j < 0 || start.i >= w || start.j >= d) return null;
  if (!isWalkable(grid, goal.i, goal.j)) return null;
  const startIdx = start.j * w + start.i;
  const goalIdx = goal.j * w + goal.i;
  if (startIdx === goalIdx) return [{ i: start.i, j: start.j }];

  const g = new Float64Array(w * d).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(w * d).fill(-1);
  const closed = new Uint8Array(w * d);
  const open = new OpenHeap();
  g[startIdx] = 0;
  const h0 = octile(start.i, start.j, goal.i, goal.j);
  open.push(startIdx, h0, h0);

  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goalIdx) return rebuild(from, cur, w);
    closed[cur] = 1;
    const ci = cur % w;
    const cj = (cur - ci) / w;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!isWalkable(grid, ni, nj)) continue;
      const diagonal = di !== 0 && dj !== 0;
      if (
        diagonal &&
        (!isWalkable(grid, ci + di, cj) || !isWalkable(grid, ci, cj + dj))
      )
        continue;
      const next = nj * w + ni;
      if (closed[next]) continue;
      const cost = g[cur] + (diagonal ? Math.SQRT2 : 1);
      if (cost >= g[next] - 1e-12) continue;
      g[next] = cost;
      from[next] = cur;
      const h = octile(ni, nj, goal.i, goal.j);
      open.push(next, cost + h, h);
    }
  }
  return null;
}

function rebuild(from: Int32Array, end: number, w: number): Tile[] {
  const out: Tile[] = [];
  for (let n = end; n !== -1; n = from[n]) {
    const i = n % w;
    out.push({ i, j: (n - i) / w });
  }
  return out.reverse();
}

/** Longueur d'un chemin (orthogonal = 1, diagonal = √2). */
export function pathLength(path: Tile[]): number {
  let len = 0;
  for (let k = 1; k < path.length; k++) {
    const di = Math.abs(path[k].i - path[k - 1].i);
    const dj = Math.abs(path[k].j - path[k - 1].j);
    len += di && dj ? Math.SQRT2 : 1;
  }
  return len;
}
