import { describe, expect, it } from 'vitest';
import {
  createWalkGrid,
  findPath,
  isWalkable,
  pathLength,
  type WalkGrid,
} from '../../features/player/library/engine/pathfinding';
import type { Tile } from '../../features/player/library/engine/projection';
import {
  DEMO_PLAYER_START,
  DEMO_ROOM,
} from '../../features/player/library/demoRoom';
import { PLACEHOLDER_CATALOG } from '../../features/player/library/engine/assets';
import { buildWalkGrid } from '../../features/player/library/engine/room';
import { mulberry32 } from '../../features/player/library/engine/world';

function grid(rows: string[]): WalkGrid {
  // '#' = bloqué ; ligne = j, colonne = i.
  const g = createWalkGrid(rows[0].length, rows.length);
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => {
      if (c === '#') g.blocked[j * g.w + i] = 1;
    })
  );
  return g;
}

const t = (i: number, j: number): Tile => ({ i, j });

/** Chaque pas est un voisin libre, et aucun pas diagonal ne coupe un coin. */
function assertValidPath(g: WalkGrid, path: Tile[]): void {
  for (const p of path.slice(1)) expect(isWalkable(g, p.i, p.j)).toBe(true);
  for (let k = 1; k < path.length; k++) {
    const di = path[k].i - path[k - 1].i;
    const dj = path[k].j - path[k - 1].j;
    expect(Math.max(Math.abs(di), Math.abs(dj))).toBe(1);
    if (di !== 0 && dj !== 0) {
      expect(isWalkable(g, path[k - 1].i + di, path[k - 1].j)).toBe(true);
      expect(isWalkable(g, path[k - 1].i, path[k - 1].j + dj)).toBe(true);
    }
  }
}

/** Dijkstra de référence (mêmes règles), pour vérifier l'optimalité d'A*. */
function referenceCost(g: WalkGrid, s: Tile, e: Tile): number | null {
  const dist = new Map<number, number>([[s.j * g.w + s.i, 0]]);
  const todo = new Set<number>([s.j * g.w + s.i]);
  while (todo.size) {
    let cur = -1;
    for (const n of todo)
      if (cur === -1 || (dist.get(n) ?? 0) < (dist.get(cur) ?? 0)) cur = n;
    todo.delete(cur);
    const ci = cur % g.w;
    const cj = (cur - ci) / g.w;
    if (ci === e.i && cj === e.j) return dist.get(cur) ?? null;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (!isWalkable(g, ni, nj)) continue;
        if (
          di &&
          dj &&
          (!isWalkable(g, ci + di, cj) || !isWalkable(g, ci, cj + dj))
        )
          continue;
        const nd = (dist.get(cur) ?? 0) + (di && dj ? Math.SQRT2 : 1);
        const key = nj * g.w + ni;
        if (nd < (dist.get(key) ?? Number.POSITIVE_INFINITY) - 1e-12) {
          dist.set(key, nd);
          todo.add(key);
        }
      }
  }
  return null;
}

describe('findPath', () => {
  it('ligne droite et diagonale sur une grille vide', () => {
    const g = createWalkGrid(6, 6);
    expect(findPath(g, t(0, 0), t(4, 0))).toEqual([
      t(0, 0),
      t(1, 0),
      t(2, 0),
      t(3, 0),
      t(4, 0),
    ]);
    const diag = findPath(g, t(0, 0), t(3, 3));
    expect(diag).toEqual([t(0, 0), t(1, 1), t(2, 2), t(3, 3)]);
    expect(pathLength(diag ?? [])).toBeCloseTo(3 * Math.SQRT2, 12);
  });

  it('départ = arrivée : [départ]', () => {
    expect(findPath(createWalkGrid(3, 3), t(1, 1), t(1, 1))).toEqual([t(1, 1)]);
  });

  it('contourne un mur par sa seule ouverture', () => {
    const g = grid(['......', '#####.', '......', '.#####', '......']);
    const path = findPath(g, t(0, 0), t(0, 4));
    expect(path).not.toBeNull();
    assertValidPath(g, path ?? []);
    expect(path).toContainEqual(t(5, 1));
    expect(path).toContainEqual(t(0, 3));
    expect(pathLength(path ?? [])).toBeCloseTo(
      referenceCost(g, t(0, 0), t(0, 4)) ?? -1,
      9
    );
  });

  it('ne coupe pas les coins : un obstacle orthogonal interdit la diagonale', () => {
    const g = grid(['.#', '..']);
    // (0,0) → (1,1) en diagonale longerait (1,0) bloqué : détour par (0,1).
    expect(findPath(g, t(0, 0), t(1, 1))).toEqual([t(0, 0), t(0, 1), t(1, 1)]);
  });

  it('ne se faufile pas entre deux cases bloquées qui se touchent par un coin', () => {
    const g = grid(['.#', '#.']);
    expect(findPath(g, t(0, 0), t(1, 1))).toBeNull();
  });

  it('cible inaccessible, bloquée ou hors salle : null', () => {
    const g = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    expect(findPath(g, t(0, 0), t(2, 2))).toBeNull(); // enclos
    expect(findPath(g, t(0, 0), t(1, 1))).toBeNull(); // bloquée
    expect(findPath(g, t(0, 0), t(5, 0))).toBeNull(); // hors salle
    expect(findPath(g, t(0, 0), t(-1, 0))).toBeNull();
  });

  it('peut partir d’une case bloquée (avatar posé avant un meuble)', () => {
    const g = grid(['#..']);
    expect(findPath(g, t(0, 0), t(2, 0))).toEqual([t(0, 0), t(1, 0), t(2, 0)]);
  });

  it('chemins valides et optimaux sur des grilles aléatoires', () => {
    const rand = mulberry32(7);
    for (let n = 0; n < 60; n++) {
      const g = createWalkGrid(10, 9);
      for (let k = 0; k < g.blocked.length; k++)
        g.blocked[k] = rand() < 0.28 ? 1 : 0;
      const s = t(Math.floor(rand() * 10), Math.floor(rand() * 9));
      const e = t(Math.floor(rand() * 10), Math.floor(rand() * 9));
      g.blocked[s.j * g.w + s.i] = 0;
      const path = findPath(g, s, e);
      const ref = isWalkable(g, e.i, e.j) ? referenceCost(g, s, e) : null;
      if (ref === null) {
        expect(path).toBeNull();
        continue;
      }
      expect(path).not.toBeNull();
      const p = path ?? [];
      expect(p[0]).toEqual(s);
      expect(p[p.length - 1]).toEqual(e);
      assertValidPath(g, p);
      expect(pathLength(p)).toBeCloseTo(ref, 9);
    }
  });
});

describe('buildWalkGrid', () => {
  it('bloque l’empreinte tournée des meubles', () => {
    const g = buildWalkGrid(
      {
        w: 6,
        d: 6,
        wallHeight: 2.5,
        items: [
          { id: 'a', key: 'shelf', gx: 1, gy: 0, r: 0 },
          { id: 'b', key: 'shelf', gx: 0, gy: 3, r: 1 },
          { id: 'c', key: 'mystery', gx: 4, gy: 4, r: 2 },
        ],
      },
      { shelf: { footprint: { w: 2, d: 1 }, height: 2 } }
    );
    const blocked = [];
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < 6; i++)
        if (!isWalkable(g, i, j)) blocked.push(`${i},${j}`);
    // r = 0 : 2 × 1 le long de gx ; r = 1 : 1 × 2 le long de gy ; clé inconnue : 1 × 1.
    expect(blocked.sort()).toEqual(['0,3', '0,4', '1,0', '2,0', '4,4'].sort());
  });

  it('salle de démo : départ libre, toute case libre atteignable', () => {
    const g = buildWalkGrid(DEMO_ROOM, PLACEHOLDER_CATALOG);
    const s = DEMO_PLAYER_START;
    expect(isWalkable(g, s.i, s.j)).toBe(true);
    // Remplissage depuis le départ, mêmes règles de voisinage que l'A*.
    const seen = new Set<number>([s.j * g.w + s.i]);
    const todo: Tile[] = [s];
    while (todo.length) {
      const c = todo.pop() as Tile;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const n = { i: c.i + di, j: c.j + dj };
          if (!isWalkable(g, n.i, n.j) || seen.has(n.j * g.w + n.i)) continue;
          if (
            di &&
            dj &&
            (!isWalkable(g, c.i + di, c.j) || !isWalkable(g, c.i, c.j + dj))
          )
            continue;
          seen.add(n.j * g.w + n.i);
          todo.push(n);
        }
    }
    let free = 0;
    for (let k = 0; k < g.blocked.length; k++) if (!g.blocked[k]) free++;
    expect(seen.size).toBe(free);
    // Exemple de trajet long : du départ au coin du fond.
    expect(findPath(g, s, { i: 2, j: 2 })).not.toBeNull();
  });
});
