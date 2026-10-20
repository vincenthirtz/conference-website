// Women's Library, lot 7 — le hall et les salles communes, côté modèle :
//   * les décors fixes ont les dimensions que l'API donne aux salles
//     (`config/library/commonRooms.ts`, copie synchronisée) ;
//   * les zones du hall visent des meubles et des portes qui existent, et
//     chaque porte se vise (le panneau d'annonces ne la cache pas) ;
//   * la salle de lecture a son guichet (lot 8 le trouve) et sa porte du hall ;
//   * une salle commune où l'on entre prend son décor fixe (`sceneOf`) et son
//     arrivée ; `?room=` l'emporte sur `?place=` ;
//   * l'appui sur une zone va au bon écran (hall, salle de lecture, lieu).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/router', () => ({ default: { push: vi.fn() } }));

import { LIBRARY_COMMON_ROOMS } from '../../config/library/commonRooms';
import {
  type LibraryManifest,
  mergeCatalog,
  parseManifest,
} from '../../features/player/library/engine/assets';
import { hotspotAt } from '../../features/player/library/engine/hotspots';
import { gridToScreen } from '../../features/player/library/engine/projection';
import { subscribeHallSpots } from '../../features/player/library/hall/spotRequests';
import {
  DOOR_HEIGHT_M,
  DOOR_SPAN,
  HALL_DOORS,
  HALL_HOTSPOTS,
  HALL_PLAYER_START,
  HALL_ROOM,
} from '../../features/player/library/layouts/hall';
import { fixedLayoutOf } from '../../features/player/library/layouts';
import {
  READING_HALL_DOOR,
  READING_PLAYER_START,
  READING_ROOM,
} from '../../features/player/library/layouts/readingRoom';
import { readingRoomHotspots } from '../../features/player/library/readingRoom/hotspots';
import { subscribeReadingRoomSpots } from '../../features/player/library/readingRoom/spotRequests';
import {
  libraryViewOf,
  parsePlaceParam,
  placeHref,
  roomStartPosition,
  sceneOf,
} from '../../features/player/library/roomStageModel';
import { roomHotspotsOf } from '../../features/player/library/ui/places/useRoomHotspots';

const manifest = parseManifest(
  JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/library/spike/manifest.json'),
      'utf8'
    )
  )
) as LibraryManifest;
const catalog = mergeCatalog(manifest);

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  while (unsubscribers.length) unsubscribers.pop()?.();
});

describe('décors fixes ↔ salles de l’API', () => {
  it('le hall et la salle de lecture ont les dimensions de config/library/commonRooms', () => {
    expect([HALL_ROOM.w, HALL_ROOM.d]).toEqual([
      LIBRARY_COMMON_ROOMS.hall.width,
      LIBRARY_COMMON_ROOMS.hall.depth,
    ]);
    expect([READING_ROOM.w, READING_ROOM.d]).toEqual([
      LIBRARY_COMMON_ROOMS.reading_room.width,
      LIBRARY_COMMON_ROOMS.reading_room.depth,
    ]);
    expect(fixedLayoutOf('hall')?.room).toBe(HALL_ROOM);
    expect(fixedLayoutOf('reading_room')?.room).toBe(READING_ROOM);
    expect(fixedLayoutOf('apartment')).toBeNull();
    expect(fixedLayoutOf('team_hq')).toBeNull();
  });

  it('une porte du décor a la largeur et tient sous la hauteur du manifeste', () => {
    const style = manifest.decor.walls.library;
    expect(style.right.door.span).toBe(DOOR_SPAN);
    expect(style.left.door.span).toBe(DOOR_SPAN);
    expect(DOOR_HEIGHT_M).toBeLessThan(style.height);
  });
});

describe('les zones du hall', () => {
  it('visent un meuble posé et des portes du décor', () => {
    const ids = new Set(HALL_ROOM.items.map((i) => i.id));
    for (const spot of HALL_HOTSPOTS) {
      if (spot.shape.kind === 'item')
        expect(ids.has(spot.shape.itemId)).toBe(true);
      if (spot.shape.kind === 'wall') {
        const { side, at } = spot.shape;
        expect(HALL_ROOM.decor?.[side]).toContainEqual({ at, variant: 'door' });
      }
    }
    expect(HALL_HOTSPOTS.map((s) => s.id)).toEqual([
      'board',
      'reading_room',
      'apartments',
      'team_hq',
    ]);
  });

  it('chaque porte se vise sur toute sa hauteur utile, le panneau sur son image', () => {
    const world = { room: HALL_ROOM, catalog };
    const hit = (gx: number, gy: number, z: number) => {
      const p = gridToScreen(gx, gy, z);
      return hotspotAt(world, HALL_HOTSPOTS, p.x, p.y)?.id ?? null;
    };
    const { readingRoom, teamHq, entrance } = HALL_DOORS;
    // Le bas et le haut de la moitié gauche de la porte de la salle de lecture.
    expect(hit(readingRoom.at + 0.5, 0, 0.3)).toBe('reading_room');
    expect(hit(readingRoom.at + 0.5, 0, 2)).toBe('reading_room');
    expect(hit(teamHq.at + 1, 0, 1)).toBe('team_hq');
    expect(hit(0, entrance.at + 1, 1)).toBe('apartments');
    expect(hit(7.5, 1.5, 1)).toBe('board');
  });
});

describe('la Grande salle de lecture', () => {
  it('a un guichet près de la porte, que le lot 8 trouve', () => {
    const desks = READING_ROOM.items.filter((i) => i.key === 'reception_desk');
    expect(desks).toHaveLength(1);
    expect(readingRoomHotspots().map((s) => s.id)).toContain('guichet');
  });

  it('sa porte du hall est une porte du décor', () => {
    const shape = READING_HALL_DOOR.shape;
    expect(shape.kind).toBe('wall');
    if (shape.kind !== 'wall') return;
    expect(READING_ROOM.decor?.[shape.side]).toContainEqual({
      at: shape.at,
      variant: 'door',
    });
  });
});

describe('sceneOf / roomStartPosition', () => {
  const decor = { floor: 'parquet', wall: 'plain' } as const;
  const room = (kind: 'hall' | 'reading_room' | 'apartment') => ({
    id: 'r1',
    kind,
    name: null,
    access: 'open' as const,
    width: 5,
    depth: 5,
    decor,
    version: 0,
    isOwner: false,
    tenantId: 't',
  });

  it('le hall prend son décor fixe : dimensions, meubles, décor, arrivée', () => {
    const scene = sceneOf({ room: room('hall'), items: [] });
    expect(scene.room).toMatchObject({ id: 'r1', width: 28, depth: 22 });
    expect(scene.items).toHaveLength(HALL_ROOM.items.length);
    expect(scene.items[0]).toEqual({
      inventoryId: HALL_ROOM.items[0].id,
      key: HALL_ROOM.items[0].key,
      gx: HALL_ROOM.items[0].gx,
      gy: HALL_ROOM.items[0].gy,
      rotation: HALL_ROOM.items[0].r,
    });
    expect(scene.fixed).toEqual({
      decor: HALL_ROOM.decor,
      wallHeight: HALL_ROOM.wallHeight,
      start: HALL_PLAYER_START,
    });
    expect(
      roomStartPosition({ room: room('hall'), items: [] }, new Map())
    ).toEqual({
      gx: HALL_PLAYER_START.i,
      gy: HALL_PLAYER_START.j,
      dir: 4,
    });
    expect(
      roomStartPosition({ room: room('reading_room'), items: [] }, new Map())
    ).toMatchObject({ gx: READING_PLAYER_START.i, gy: READING_PLAYER_START.j });
  });

  it('un appartement reste tel qu’`enter` le rend', () => {
    const items = [
      { inventoryId: 'i1', key: 'lamp', gx: 1, gy: 1, rotation: 0 },
    ];
    const enter = { room: room('apartment'), items };
    const scene = sceneOf(enter);
    expect(scene).toEqual({ room: enter.room, items, fixed: null });
    expect(roomStartPosition(enter, new Map())).toEqual({
      gx: 2,
      gy: 2,
      dir: 4,
    });
  });
});

describe('adresse de /player/library', () => {
  const ROOM = '0000000A-0000-4000-8000-000000000001';

  it('`?place=` : hall ou salle de lecture, rien d’autre', () => {
    expect(parsePlaceParam('hall')).toBe('hall');
    expect(parsePlaceParam('reading_room')).toBe('reading_room');
    for (const v of ['HALL', 'apartment', 'team_hq', ['hall'], undefined, ''])
      expect(parsePlaceParam(v)).toBeNull();
    expect(placeHref('reading_room')).toBe(
      '/player/library?place=reading_room'
    );
  });

  it('`?room=` l’emporte, puis `?place=`, sinon l’appartement', () => {
    expect(libraryViewOf({ room: ROOM, place: 'hall' })).toEqual({
      kind: 'room',
      roomId: ROOM.toLowerCase(),
    });
    expect(libraryViewOf({ place: 'hall' })).toEqual({
      kind: 'place',
      place: 'hall',
    });
    expect(
      libraryViewOf({ room: 'pas-un-uuid', place: 'reading_room' })
    ).toEqual({
      kind: 'place',
      place: 'reading_room',
    });
    expect(libraryViewOf({})).toEqual({ kind: 'apartment' });
  });
});

describe('roomHotspotsOf — où va un appui', () => {
  const labels = {
    board: 'Panneau',
    shelf: 'Rayonnage',
    guichet: 'Guichet',
    hall: 'Porte du hall',
  };
  const anchor = { x: 0, y: 0 };

  it('hall : les zones nommées, l’appui à l’écran du hall', () => {
    const navigate = vi.fn();
    const { hotspots, onHotspotTap } = roomHotspotsOf('hall', labels, navigate);
    expect(hotspots.map((h) => h.id)).toEqual(HALL_HOTSPOTS.map((h) => h.id));
    expect(hotspots[0].label).toBe('Panneau');
    const heard = vi.fn();
    unsubscribers.push(subscribeHallSpots(heard));
    onHotspotTap({ id: 'board', anchor });
    onHotspotTap({ id: 'reading_room', anchor });
    expect(heard.mock.calls).toEqual([['board'], ['reading_room']]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('hall sans écran abonné : la porte de la salle de lecture mène quand même', () => {
    const navigate = vi.fn();
    roomHotspotsOf('hall', labels, navigate).onHotspotTap({
      id: 'reading_room',
      anchor,
    });
    expect(navigate).toHaveBeenCalledWith('/player/library?place=reading_room');
  });

  it('salle de lecture : rayonnages et guichet au lot 8, la porte vers le hall', () => {
    const navigate = vi.fn();
    const { hotspots, onHotspotTap } = roomHotspotsOf(
      'reading_room',
      labels,
      navigate
    );
    const ids = hotspots.map((h) => h.id);
    expect(ids).toContain('guichet');
    expect(ids).toContain('hall');
    expect(hotspots.find((h) => h.id === 'guichet')?.label).toBe('Guichet');
    const heard = vi.fn();
    unsubscribers.push(subscribeReadingRoomSpots(heard));
    onHotspotTap({ id: 'guichet', anchor });
    expect(heard).toHaveBeenCalledWith('guichet');
    onHotspotTap({ id: 'hall', anchor });
    expect(navigate).toHaveBeenCalledWith('/player/library?place=hall');
  });

  it('appartement (et QG, réservé au lot 9) : aucune zone', () => {
    expect(roomHotspotsOf('apartment', labels).hotspots).toEqual([]);
    expect(roomHotspotsOf('team_hq', labels).hotspots).toEqual([]);
    expect(roomHotspotsOf(null, labels).hotspots).toEqual([]);
  });
});
