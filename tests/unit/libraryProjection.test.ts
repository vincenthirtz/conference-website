import { describe, expect, it } from 'vitest';
import {
  centerCamera,
  clampZoom,
  gridToScreen,
  METERS_PER_TILE,
  metersToTiles,
  pickTile,
  PX_PER_METER,
  screenToGrid,
  TILE_H,
  TILE_W,
  worldToCanvas,
  Z_PX,
  zoomAt,
  type Camera,
} from '../../features/player/library/engine/projection';

const ROOM = { w: 12, d: 12 };
const ID: Camera = { x: 0, y: 0, zoom: 1 };

describe('projection : constantes du contrat', () => {
  it('case de 0,5 m en losange 2:1 de 64 × 32, 1 m vertical ≈ 78,38 px', () => {
    expect(TILE_W).toBe(64);
    expect(TILE_H).toBe(32);
    expect(METERS_PER_TILE).toBe(0.5);
    expect(PX_PER_METER).toBeCloseTo(90.5097, 4);
    expect(Z_PX).toBeCloseTo(78.3837, 4);
    // Z_PX = cos 30° × TILE_W / (√2 × METERS_PER_TILE).
    expect(Z_PX).toBeCloseTo(
      (Math.cos(Math.PI / 6) * TILE_W) / (Math.SQRT2 * METERS_PER_TILE),
      12
    );
    // Élévation 30° : le sol est raccourci de sin 30° = 1/2.
    expect(TILE_H / TILE_W).toBe(0.5);
    expect(Z_PX / PX_PER_METER).toBeCloseTo(Math.cos(Math.PI / 6), 12);
  });

  it('une case de côté (0,5 m) dressée à la verticale fait ≈ 39,19 px', () => {
    const o = gridToScreen(0, 0, 0);
    const up = gridToScreen(0, 0, METERS_PER_TILE);
    expect(o.y - up.y).toBeCloseTo(39.1918, 4);
    // Diagonale d'une case : 0,5 × √2 m → TILE_W px à l'horizontale.
    expect(METERS_PER_TILE * Math.SQRT2 * PX_PER_METER).toBeCloseTo(TILE_W, 9);
  });

  it('metersToTiles : 1 m = 2 cases', () => {
    expect(metersToTiles(1)).toBe(2);
    expect(metersToTiles(1.3)).toBeCloseTo(2.6, 12);
  });
});

describe('gridToScreen', () => {
  it('sommets du losange de la case (0, 0)', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(gridToScreen(1, 1)).toEqual({ x: 0, y: 32 });
    expect(gridToScreen(0, 1)).toEqual({ x: -32, y: 16 });
  });

  it('gx vers le bas-droite, gy vers le bas-gauche, z vers le haut', () => {
    const o = gridToScreen(3, 4);
    const ex = gridToScreen(4, 4);
    const ey = gridToScreen(3, 5);
    expect(ex.x > o.x && ex.y > o.y).toBe(true);
    expect(ey.x < o.x && ey.y > o.y).toBe(true);
    const up = gridToScreen(3, 4, 1);
    expect(up.x).toBe(o.x);
    expect(o.y - up.y).toBeCloseTo(Z_PX, 10);
  });

  it('sommet haut de la case (i, j) = gridToScreen(i, j)', () => {
    // Le sommet haut est le point le plus haut des 4 coins de la case.
    for (const [i, j] of [
      [0, 0],
      [5, 2],
      [11, 11],
    ]) {
      const corners = [
        gridToScreen(i, j),
        gridToScreen(i + 1, j),
        gridToScreen(i + 1, j + 1),
        gridToScreen(i, j + 1),
      ];
      const top = corners.reduce((a, b) => (b.y < a.y ? b : a));
      expect(top).toEqual(gridToScreen(i, j));
    }
  });
});

describe('screenToGrid', () => {
  it('aller-retour grille ↔ écran', () => {
    for (let gx = -3; gx <= 14; gx += 0.37) {
      for (let gy = -2; gy <= 13; gy += 0.41) {
        const s = gridToScreen(gx, gy);
        const g = screenToGrid(s.x, s.y);
        expect(g.gx).toBeCloseTo(gx, 9);
        expect(g.gy).toBeCloseTo(gy, 9);
      }
    }
  });
});

describe('pickTile', () => {
  const at = (gx: number, gy: number, cam: Camera = ID) => {
    const p = worldToCanvas(gridToScreen(gx, gy), cam);
    return pickTile(p.x, p.y, cam, ROOM);
  };

  it('centre de chaque case', () => {
    for (let i = 0; i < ROOM.w; i++)
      for (let j = 0; j < ROOM.d; j++)
        expect(at(i + 0.5, j + 0.5)).toEqual({ i, j });
  });

  it('juste à l’intérieur des quatre sommets du losange', () => {
    const e = 1e-3;
    expect(at(4 + e, 7 + e)).toEqual({ i: 4, j: 7 }); // sommet haut
    expect(at(5 - e, 7 + e)).toEqual({ i: 4, j: 7 }); // sommet droit
    expect(at(5 - e, 8 - e)).toEqual({ i: 4, j: 7 }); // sommet bas
    expect(at(4 + e, 8 - e)).toEqual({ i: 4, j: 7 }); // sommet gauche
  });

  it('une arête appartient à la case d’indice supérieur', () => {
    expect(at(5, 7.5)).toEqual({ i: 5, j: 7 });
    expect(at(4.5, 8)).toEqual({ i: 4, j: 8 });
    expect(at(5 - 1e-6, 7.5)).toEqual({ i: 4, j: 7 });
  });

  it('hors de la salle : null', () => {
    expect(at(-0.01, 3)).toBeNull();
    expect(at(3, -0.01)).toBeNull();
    expect(at(12, 3)).toBeNull();
    expect(at(3, 12.5)).toBeNull();
  });

  it('tient compte du décalage et du zoom de la caméra', () => {
    for (const cam of [
      { x: 400, y: 120, zoom: 2 },
      { x: -50, y: 300, zoom: 0.5 },
      { x: 613.25, y: 87.5, zoom: 1.37 },
    ]) {
      expect(at(6.5, 2.5, cam)).toEqual({ i: 6, j: 2 });
      expect(at(0.01, 0.01, cam)).toEqual({ i: 0, j: 0 });
      expect(at(11.99, 11.99, cam)).toEqual({ i: 11, j: 11 });
    }
  });
});

describe('caméra', () => {
  it('zoom borné entre 0,5 et 2', () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it('zoomAt garde fixe le point sous le curseur', () => {
    const cam = { x: 100, y: 50, zoom: 1 };
    const anchor = { x: 320, y: 240 };
    const before = screenToGrid(
      (anchor.x - cam.x) / cam.zoom,
      (anchor.y - cam.y) / cam.zoom
    );
    const z = zoomAt(cam, anchor.x, anchor.y, 1.5);
    expect(z.zoom).toBe(1.5);
    const after = screenToGrid(
      (anchor.x - z.x) / z.zoom,
      (anchor.y - z.y) / z.zoom
    );
    expect(after.gx).toBeCloseTo(before.gx, 9);
    expect(after.gy).toBeCloseTo(before.gy, 9);
    expect(zoomAt(z, 0, 0, 100).zoom).toBe(2);
    expect(zoomAt(z, 0, 0, 0.01).zoom).toBe(0.5);
  });

  it('centerCamera centre la salle et ses murs', () => {
    const cam = centerCamera(ROOM, 2.6, 1000, 700);
    const left = worldToCanvas(gridToScreen(0, ROOM.d), cam).x;
    const right = worldToCanvas(gridToScreen(ROOM.w, 0), cam).x;
    const top = worldToCanvas(gridToScreen(0, 0, 2.6), cam).y;
    const bottom = worldToCanvas(gridToScreen(ROOM.w, ROOM.d), cam).y;
    expect((left + right) / 2).toBeCloseTo(500, 9);
    expect((top + bottom) / 2).toBeCloseTo(350, 9);
  });
});
