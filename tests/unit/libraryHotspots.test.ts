// @vitest-environment happy-dom
//
// Women's Library, lot 7 — les ZONES INTERACTIVES du moteur
// (`engine/hotspots.ts`) et leur branchement dans le contrôleur :
//   * trois formes (l'image d'un meuble, un pavé de cases, un pan de mur),
//     la plus en avant gagne, un mur en dernier ;
//   * un pavé sans hauteur prend celle du plus haut meuble qu'il couvre ;
//   * l'ancre d'un appui est au-dessus de la zone, en px du conteneur ;
//   * le survol à la souris : main, infobulle, contour du meuble ou case au
//     pied ; ailleurs, la case du sol ;
//   * dans le contrôleur, en `walk` : une autre joueuse d'abord, PUIS la
//     zone (sans marcher), PUIS le sol.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/player/library/engine/renderer', () => ({
  LibraryRenderer: class {
    manifest = null;
    playerId: string | null = null;
    ghost = null;
    selectedId: string | null = null;
    hiddenId = null;
    resize() {}
    draw() {
      return { drawMs: 0, objects: 0, sprites: 0 };
    }
  },
}));

import {
  type ControllerOptions,
  LibraryController,
} from '../../features/player/library/engine/controller';
import {
  HotspotLayer,
  type HotspotWorld,
  hotspotAt,
  type LibraryHotspot,
} from '../../features/player/library/engine/hotspots';
import { isWalking } from '../../features/player/library/engine/motion';
import {
  gridToScreen,
  worldToCanvas,
} from '../../features/player/library/engine/projection';
import type { RoomItem } from '../../features/player/library/engine/room';

const CATALOG = {
  board: { footprint: { w: 3, d: 1 }, height: 1.9 },
  shelf: { footprint: { w: 2, d: 3 }, height: 2.06 },
  stool: { footprint: { w: 1, d: 1 }, height: 0.5 },
};

const ITEMS: RoomItem[] = [
  { id: 'notice-board', key: 'board', gx: 7, gy: 1, r: 0 },
  { id: 'stack', key: 'shelf', gx: 10, gy: 4, r: 0 },
  { id: 'stool', key: 'stool', gx: 2, gy: 8, r: 0 },
];

const world = (
  items: RoomItem[] = ITEMS
): HotspotWorld & {
  room: { w: number; d: number; items: RoomItem[] };
} => ({ room: { w: 20, d: 20, items }, catalog: CATALOG });

const BOARD: LibraryHotspot = {
  id: 'board',
  label: 'Panneau',
  shape: { kind: 'item', itemId: 'notice-board' },
};
const SHELF_AREA: LibraryHotspot = {
  id: 'shelf',
  shape: { kind: 'area', area: { minX: 10, minY: 4, maxX: 12, maxY: 7 } },
};
const DOOR: LibraryHotspot = {
  id: 'door',
  label: 'Porte',
  shape: { kind: 'wall', side: 'right', at: 3, span: 2, heightM: 2.2 },
};
const LEFT_DOOR: LibraryHotspot = {
  id: 'left-door',
  shape: { kind: 'wall', side: 'left', at: 9, span: 2, heightM: 2.2 },
};

const at = (list: LibraryHotspot[], gx: number, gy: number, z = 0) => {
  const p = gridToScreen(gx, gy, z);
  return hotspotAt(world(), list, p.x, p.y)?.id ?? null;
};

describe('hotspotAt — les trois formes', () => {
  it('l’image d’un meuble posé (par son id dans la salle)', () => {
    expect(at([BOARD], 8.5, 1.5, 1)).toBe('board');
    expect(at([BOARD], 15, 15)).toBeNull();
    // Un meuble absent de la salle : pas de zone.
    const gone = { ...BOARD, shape: { kind: 'item', itemId: 'nope' } as const };
    expect(at([gone], 8.5, 1.5, 1)).toBeNull();
  });

  it('un pavé prend la hauteur du plus haut meuble qu’il couvre ; vide, il reste au sol', () => {
    expect(at([SHELF_AREA], 11, 5.5, 1.9)).toBe('shelf');
    const empty: LibraryHotspot = {
      id: 'empty',
      shape: { kind: 'area', area: { minX: 14, minY: 14, maxX: 16, maxY: 16 } },
    };
    expect(at([empty], 15, 15, 0.05)).toBe('empty');
    expect(at([empty], 15, 15, 1.5)).toBeNull();
    const tall: LibraryHotspot = {
      ...empty,
      shape: { ...empty.shape, heightM: 2 } as LibraryHotspot['shape'],
    };
    expect(at([tall], 15, 15, 1.5)).toBe('empty');
  });

  it('un pan de mur du fond, à droite comme à gauche, borné en largeur et en hauteur', () => {
    expect(at([DOOR], 4, 0, 1)).toBe('door');
    expect(at([DOOR], 3, 0, 2.1)).toBe('door');
    expect(at([DOOR], 6, 0, 1)).toBeNull();
    expect(at([DOOR], 4, 0, 2.5)).toBeNull();
    expect(at([LEFT_DOOR], 0, 10, 1)).toBe('left-door');
    expect(at([LEFT_DOOR], 0, 12, 1)).toBeNull();
  });

  it('la zone la plus en avant gagne, et un mur passe après un meuble devant lui', () => {
    const front: LibraryHotspot = {
      id: 'front',
      shape: {
        kind: 'area',
        area: { minX: 3, minY: 0, maxX: 5, maxY: 1 },
        heightM: 2,
      },
    };
    // Le point est sur le mur ET sur le meuble posé contre lui.
    expect(at([DOOR, front], 4, 0, 1)).toBe('front');
    expect(at([front, DOOR], 4, 0, 1)).toBe('front');
    const behind: LibraryHotspot = {
      id: 'behind',
      shape: {
        kind: 'area',
        area: { minX: 10, minY: 2, maxX: 12, maxY: 4 },
        heightM: 3,
      },
    };
    const p = gridToScreen(11, 5, 1.5);
    const w = world();
    expect(hotspotAt(w, [behind, SHELF_AREA], p.x, p.y)?.id).toBe('shelf');
  });
});

function fakeCanvas() {
  return {
    style: { cursor: '' },
    title: '',
    dataset: {} as Record<string, string>,
  } as unknown as HTMLCanvasElement;
}

describe('HotspotLayer', () => {
  const cam = { x: 100, y: 50, zoom: 2 };
  const toCanvas = (gx: number, gy: number, z = 0) =>
    worldToCanvas(gridToScreen(gx, gy, z), cam);

  it('un appui rend l’id et une ancre au-dessus de la zone (px du conteneur)', () => {
    const layer = new HotspotLayer(fakeCanvas(), [BOARD, DOOR], {
      setSelection: () => {},
    });
    const tap = layer.at(world(), cam, toCanvas(8.5, 1.5, 1));
    expect(tap?.id).toBe('board');
    // Au-dessus du milieu de l'image : centre de l'empreinte, en haut.
    expect(tap?.anchor).toEqual(toCanvas(8.5, 1.5, 1.9));
    const door = layer.at(world(), cam, toCanvas(4, 0, 1));
    expect(door).toEqual({ id: 'door', anchor: toCanvas(4, 0, 2.2) });
    expect(layer.at(world(), cam, toCanvas(15, 15))).toBeNull();
  });

  it('le survol : main, infobulle, contour du meuble ou case au pied ; ailleurs, la case du sol', () => {
    const canvas = fakeCanvas();
    const setSelection = vi.fn();
    const layer = new HotspotLayer(canvas, [BOARD, DOOR], { setSelection });

    expect(layer.hover(world(), cam, toCanvas(8.5, 1.5, 1))).toBeNull();
    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.title).toBe('Panneau');
    expect(canvas.dataset.hotspot).toBe('board');
    expect(setSelection).toHaveBeenLastCalledWith('notice-board');

    expect(layer.hover(world(), cam, toCanvas(4, 0, 1))).toEqual({
      i: 4,
      j: 0,
    });
    expect(canvas.title).toBe('Porte');
    expect(setSelection).toHaveBeenLastCalledWith(null);

    expect(layer.hover(world(), cam, toCanvas(12.5, 15.5))).toEqual({
      i: 12,
      j: 15,
    });
    expect(canvas.style.cursor).toBe('');
    expect(canvas.dataset.hotspot).toBe('');

    // Un même survol ne rappelle pas l'éclairage.
    setSelection.mockClear();
    layer.hover(world(), cam, toCanvas(13.5, 15.5));
    expect(setSelection).not.toHaveBeenCalled();

    layer.hover(world(), cam, toCanvas(8.5, 1.5, 1));
    layer.hover(world(), cam, null);
    expect(canvas.style.cursor).toBe('');
    expect(setSelection).toHaveBeenLastCalledWith(null);
  });

  it('`set` remplace les zones et efface un survol', () => {
    const canvas = fakeCanvas();
    const layer = new HotspotLayer(canvas, [BOARD], { setSelection: () => {} });
    layer.hover(world(), cam, toCanvas(8.5, 1.5, 1));
    layer.set([]);
    expect(layer.size).toBe(0);
    expect(canvas.style.cursor).toBe('');
    expect(layer.at(world(), cam, toCanvas(8.5, 1.5, 1))).toBeNull();
  });
});

/* -------------------------------------------- dans le contrôleur (walk) --- */

let canvas: HTMLCanvasElement;
let container: HTMLDivElement;
let ctrl: LibraryController | null = null;

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () => new Response('{}', { status: 404 })
  ) as unknown as typeof fetch;
  container = document.createElement('div');
  canvas = document.createElement('canvas');
  container.appendChild(canvas);
  document.body.appendChild(container);
});

afterEach(() => {
  ctrl?.dispose();
  ctrl = null;
  container.remove();
});

function mount(over: Partial<ControllerOptions> = {}) {
  const opts = {
    onAvatarTap: vi.fn(() => true),
    onPlayerWalk: vi.fn(),
    onHotspotTap: vi.fn(),
  };
  // Cadre de 0 × 0 (happy-dom) : caméra à l'origine, zoom 1.
  ctrl = new LibraryController(canvas, container, {
    room: { w: 20, d: 20, wallHeight: 2.8, items: [] },
    playerId: 'me',
    playerStart: { i: 15, j: 15 },
    hotspots: [DOOR, SHELF_AREA],
    ...opts,
    ...over,
  });
  return { ctrl, ...opts };
}

function pointer(type: string, x: number, y: number) {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: x,
      clientY: y,
      bubbles: true,
    })
  );
}

function tap(x: number, y: number) {
  pointer('pointerdown', x, y);
  pointer('pointerup', x, y);
}

describe('LibraryController — les zones', () => {
  it('un appui sur une zone appelle `onHotspotTap`, sans marcher', () => {
    const { ctrl: c, onHotspotTap, onPlayerWalk } = mount();
    const p = gridToScreen(4, 0, 1);
    tap(p.x, p.y);
    expect(onHotspotTap).toHaveBeenCalledWith({
      id: 'door',
      anchor: gridToScreen(4, 0, 2.2),
    });
    expect(onPlayerWalk).not.toHaveBeenCalled();
    expect(isWalking(c.world.avatar('me')!.walker)).toBe(false);
  });

  it('ailleurs, le sol fait marcher ; `hotspots.set` change les zones sans remonter', () => {
    const { ctrl: c, onHotspotTap, onPlayerWalk } = mount();
    const floor = gridToScreen(15.5, 12.5);
    tap(floor.x, floor.y);
    expect(onHotspotTap).not.toHaveBeenCalled();
    expect(onPlayerWalk).toHaveBeenCalledWith({ i: 15, j: 12 });

    c.hotspots.set([]);
    const door = gridToScreen(4, 0, 1);
    tap(door.x, door.y);
    expect(onHotspotTap).not.toHaveBeenCalled();
  });

  it('une autre joueuse devant une zone passe d’abord', () => {
    const {
      ctrl: c,
      onAvatarTap,
      onHotspotTap,
    } = mount({
      hotspots: [
        {
          id: 'floor-area',
          shape: {
            kind: 'area',
            area: { minX: 3, minY: 3, maxX: 7, maxY: 7 },
            heightM: 2,
          },
        },
      ],
    });
    c.syncRemoteAvatars([
      {
        id: 'iris',
        nickname: 'Iris',
        avatarId: null,
        tile: { i: 4, j: 4 },
        dir: 4,
        target: null,
        bubble: null,
      },
    ]);
    const torso = gridToScreen(4.5, 4.5, 1);
    tap(torso.x, torso.y);
    expect(onAvatarTap).toHaveBeenCalledTimes(1);
    expect(onHotspotTap).not.toHaveBeenCalled();
  });

  it('le survol à la souris met la main et nomme la zone ; la sortie efface', () => {
    mount();
    const p = gridToScreen(4, 0, 1);
    pointer('pointermove', p.x, p.y);
    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.title).toBe('Porte');
    expect(canvas.dataset.hotspot).toBe('door');
    pointer('pointerleave', p.x, p.y);
    expect(canvas.style.cursor).toBe('');
    expect(canvas.dataset.hotspot).toBe('');
  });
});
