// Salles du lot 3 (hall, Grande salle de lecture) confrontées au manifeste
// RENDU (public/library/spike/manifest.json) : chaque meuble existe, rien ne
// se chevauche ni ne déborde, les murs tiennent, la salle reste praticable.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type LibraryManifest,
  mergeCatalog,
  parseManifest,
} from '../../features/player/library/engine/assets';
import { roomWalls } from '../../features/player/library/engine/decor';
import { isWalkable } from '../../features/player/library/engine/pathfinding';
import {
  buildWalkGrid,
  layerOf,
  layoutIssues,
  specOf,
} from '../../features/player/library/engine/room';
import {
  LIBRARY_LAYOUTS,
  layoutIdOf,
} from '../../features/player/library/layouts';
import { HALL_DOORS } from '../../features/player/library/layouts/hall';

const manifest = parseManifest(
  JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/library/spike/manifest.json'),
      'utf8'
    )
  )
) as LibraryManifest;
const catalog = mergeCatalog(manifest);

/** Cases franchissables atteignables depuis `start` (8 voisins sans couper). */
function reachable(
  grid: ReturnType<typeof buildWalkGrid>,
  i0: number,
  j0: number
) {
  const seen = new Uint8Array(grid.w * grid.d);
  const stack = [[i0, j0]];
  seen[j0 * grid.w + i0] = 1;
  let n = 0;
  while (stack.length) {
    const [i, j] = stack.pop() as number[];
    n++;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di;
      const b = j + dj;
      if (!isWalkable(grid, a, b) || seen[b * grid.w + a]) continue;
      seen[b * grid.w + a] = 1;
      stack.push([a, b]);
    }
  }
  return { n, seen };
}

describe('manifeste rendu', () => {
  it('se lit, avec un décor (sols, style de mur « library »)', () => {
    expect(manifest).not.toBeNull();
    expect(Object.keys(manifest.decor.floors).sort()).toEqual([
      'carpet',
      'marble',
      'parquet',
      'tiles',
    ]);
    expect(Object.keys(manifest.decor.walls)).toEqual(['library']);
    for (const side of ['left', 'right'] as const)
      expect(Object.keys(manifest.decor.walls.library[side]).sort()).toEqual([
        'bookshelf',
        'door',
        'end',
        'plain',
        'window',
      ]);
  });

  it('chaque meuble a ses 4 rotations', () => {
    expect(Object.keys(manifest.furniture).length).toBeGreaterThanOrEqual(40);
    for (const f of Object.values(manifest.furniture))
      expect(f.rotations).toHaveLength(4);
  });
});

describe.each(['hall', 'reading'] as const)('salle %s', (id) => {
  const { room, playerStart } = LIBRARY_LAYOUTS[id];

  it('n’utilise que des meubles rendus', () => {
    const missing = room.items
      .map((i) => i.key)
      .filter((k) => !Object.hasOwn(manifest.furniture, k));
    expect(missing).toEqual([]);
  });

  it('tient sans chevauchement ni débordement (layoutIssues)', () => {
    expect(layoutIssues(room, catalog)).toEqual([]);
  });

  it('identifiants uniques', () => {
    const ids = room.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sol et murs existent dans le décor, sans variante qui déborde', () => {
    expect(
      room.decor?.floor && manifest.decor.floors[room.decor.floor]
    ).toBeTruthy();
    const style = manifest.decor.walls[room.decor?.wallStyle ?? ''];
    expect(style).toBeTruthy();
    expect(roomWalls(room, style).issues).toEqual([]);
    expect(room.wallHeight).toBe(style.height);
  });

  it('le décor mural n’est accroché que sur des cases de mur simples', () => {
    const style = manifest.decor.walls[room.decor?.wallStyle ?? ''];
    const walls = roomWalls(room, style);
    const plain = (side: 'left' | 'right', k: number) =>
      walls[side].some(
        (s) => s.variant === 'plain' && s.at <= k && k < s.at + s.span
      );
    const misplaced: string[] = [];
    for (const item of room.items) {
      const spec = specOf(catalog, item.key);
      if (layerOf(spec) !== 'wall') continue;
      const side = item.r === 0 ? 'right' : 'left';
      const start = side === 'right' ? item.gx : item.gy;
      const span = spec.footprint.w;
      for (let k = start; k < start + span; k++)
        if (!plain(side, k)) misplaced.push(`${item.id}@${k}`);
    }
    expect(misplaced).toEqual([]);
  });

  it('reste sous le budget du tri de profondeur (≤ 150 objets + 30 avatars)', () => {
    const objects = room.items.filter(
      (i) => layerOf(specOf(catalog, i.key)) === 'object'
    );
    expect(objects.length + 30).toBeLessThanOrEqual(180);
  });

  it('praticable : départ libre et toutes les cases libres atteignables', () => {
    const grid = buildWalkGrid(room, catalog);
    expect(isWalkable(grid, playerStart.i, playerStart.j)).toBe(true);
    const { seen } = reachable(grid, playerStart.i, playerStart.j);
    const enclosed: string[] = [];
    for (let j = 0; j < grid.d; j++)
      for (let i = 0; i < grid.w; i++)
        if (isWalkable(grid, i, j) && !seen[j * grid.w + i])
          enclosed.push(`${i},${j}`);
    expect(enclosed).toEqual([]);
  });
});

describe('hall', () => {
  it('les cases devant ses portes sont libres', () => {
    const { room } = LIBRARY_LAYOUTS.hall;
    const grid = buildWalkGrid(room, catalog);
    for (const door of Object.values(HALL_DOORS)) {
      for (const k of [door.at, door.at + 1]) {
        const [i, j] = door.side === 'right' ? [k, 0] : [0, k];
        expect(isWalkable(grid, i, j)).toBe(true);
      }
    }
  });
});

describe('salle de démo (lot 1) avec les empreintes rendues', () => {
  it('tient toujours', () => {
    expect(layoutIssues(LIBRARY_LAYOUTS.demo.room, catalog)).toEqual([]);
  });
});

describe('layoutIdOf', () => {
  it('lit ?room=, demo par défaut', () => {
    expect(layoutIdOf('hall')).toBe('hall');
    expect(layoutIdOf(['reading', 'hall'])).toBe('reading');
    expect(layoutIdOf('nope')).toBe('demo');
    expect(layoutIdOf(undefined)).toBe('demo');
  });
});
