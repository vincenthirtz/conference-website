// Women's Library, lot 4 phase B — ce que le moteur a appris pour le mode
// déco, sans DOM : viser un mur du fond (pickWall), viser un meuble par son
// image (boxContainsScreenPoint, LibraryWorld.itemAtScreen), changer de
// meubles et de décor sans remonter le monde (setRoomItems, setDecor).

import { describe, expect, it } from 'vitest';
import { boxContainsScreenPoint } from '../../features/player/library/engine/depthSort';
import {
  gridToScreen,
  pickWall,
  wallFootTile,
} from '../../features/player/library/engine/projection';
import type {
  FurnitureCatalog,
  RoomModel,
} from '../../features/player/library/engine/room';
import { LibraryWorld } from '../../features/player/library/engine/world';
import { boxOutline } from '../../features/player/library/engine/editOverlay';

const CAM = { x: 400, y: 100, zoom: 1 };
const ROOM = { w: 14, d: 12 };
/** Point du canvas d'un point du monde (grille + hauteur). */
const canvasAt = (gx: number, gy: number, z = 0) => {
  const p = gridToScreen(gx, gy, z);
  return { x: p.x * CAM.zoom + CAM.x, y: p.y * CAM.zoom + CAM.y };
};

describe('pickWall — viser un mur du fond', () => {
  it('mur droit (gy = 0) : la colonne et la hauteur visées', () => {
    const p = canvasAt(9.5, 0, 1.4);
    const hit = pickWall(p.x, p.y, CAM, ROOM, 2.6);
    expect(hit?.side).toBe('right');
    expect(hit?.at).toBe(9);
    expect(hit?.z).toBeCloseTo(1.4, 6);
    expect(wallFootTile(hit!)).toEqual({ i: 9, j: 0 });
  });

  it('mur gauche (gx = 0) : la rangée visée', () => {
    const p = canvasAt(0, 4.5, 2);
    const hit = pickWall(p.x, p.y, CAM, ROOM, 2.6);
    expect(hit).toMatchObject({ side: 'left', at: 4 });
    expect(wallFootTile(hit!)).toEqual({ i: 0, j: 4 });
  });

  it('au-dessus du mur, au-delà de son bout, ou sous le sol : rien', () => {
    const above = canvasAt(5, 0, 3.2);
    expect(pickWall(above.x, above.y, CAM, ROOM, 2.6)).toBeNull();
    const past = canvasAt(14.5, 0, 1);
    expect(pickWall(past.x, past.y, CAM, ROOM, 2.6)).toBeNull();
    const floor = canvasAt(5, 5, 0);
    expect(pickWall(floor.x, floor.y, CAM, ROOM, 2.6)).toBeNull();
  });
});

describe('boxContainsScreenPoint — viser une boîte par son image', () => {
  const shelf = { minX: 3, maxX: 6, minY: 0, maxY: 1, minZ: 0, maxZ: 2 };

  it('le haut d’un rayonnage (au-dessus de son empreinte) le touche', () => {
    const top = gridToScreen(4.5, 0.5, 1.8);
    expect(boxContainsScreenPoint(shelf, top.x, top.y)).toBe(true);
  });

  it('chaque sommet de sa silhouette est dedans, un point à côté non', () => {
    for (const v of boxOutline(shelf))
      expect(boxContainsScreenPoint(shelf, v.x, v.y)).toBe(true);
    const off = gridToScreen(8, 4, 0);
    expect(boxContainsScreenPoint(shelf, off.x, off.y)).toBe(false);
  });
});

describe('LibraryWorld — mode déco', () => {
  const catalog: FurnitureCatalog = {
    shelf: { footprint: { w: 3, d: 1 }, height: 2 },
    table: { footprint: { w: 2, d: 2 }, height: 0.7 },
    rug: { footprint: { w: 6, d: 4 }, height: 0.02, layer: 'floor' },
    frame: { footprint: { w: 2, d: 1 }, height: 2, layer: 'wall' },
  };
  const room: RoomModel = {
    w: 14,
    d: 12,
    wallHeight: 2.6,
    items: [{ id: 'table', key: 'table', gx: 5, gy: 5, r: 0 }],
  };

  it('copie la salle : changer les meubles ne touche pas l’objet reçu', () => {
    const world = new LibraryWorld(room, catalog);
    world.setRoomItems([
      ...room.items,
      { id: 'shelf', key: 'shelf', gx: 0, gy: 0, r: 0 },
    ]);
    expect(room.items).toHaveLength(1);
    expect(world.room.items).toHaveLength(2);
  });

  it('setRoomItems reconstruit la grille de marche', () => {
    const world = new LibraryWorld(room, catalog);
    world.addAvatar('me', { i: 10, j: 10 }, 0);
    expect(world.walkTo('me', { i: 0, j: 0 })).toBe(true);
    world.setRoomItems([{ id: 'shelf', key: 'shelf', gx: 0, gy: 0, r: 0 }]);
    expect(world.walkTo('me', { i: 0, j: 0 })).toBe(false);
    // Un tapis ne bloque pas.
    world.setRoomItems([{ id: 'rug', key: 'rug', gx: 0, gy: 0, r: 0 }]);
    expect(world.walkTo('me', { i: 0, j: 0 })).toBe(true);
  });

  it('setDecor remplace sol et murs', () => {
    const world = new LibraryWorld(room, catalog);
    world.setDecor({ floor: 'tiles', wallStyle: 'library' });
    expect(world.room.decor).toEqual({ floor: 'tiles', wallStyle: 'library' });
    expect(room.decor).toBeUndefined();
  });

  it('itemAtScreen : l’objet avant un tapis, le meuble caché exclu', () => {
    const world = new LibraryWorld(
      {
        ...room,
        items: [
          { id: 'rug', key: 'rug', gx: 4, gy: 4, r: 0 },
          { id: 'table', key: 'table', gx: 5, gy: 5, r: 0 },
          { id: 'frame', key: 'frame', gx: 8, gy: 0, r: 0 },
        ],
      },
      catalog
    );
    const onTable = gridToScreen(6, 6, 0.5);
    expect(world.itemAtScreen(onTable.x, onTable.y)?.id).toBe('table');
    expect(world.itemAtScreen(onTable.x, onTable.y, 'table')?.id).toBe('rug');
    const onFrame = gridToScreen(9, 0.5, 1.5);
    expect(world.itemAtScreen(onFrame.x, onFrame.y)?.id).toBe('frame');
    const empty = gridToScreen(12, 10, 0);
    expect(world.itemAtScreen(empty.x, empty.y)).toBeNull();
  });
});
