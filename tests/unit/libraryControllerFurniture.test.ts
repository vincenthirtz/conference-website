// @vitest-environment happy-dom
//
// Women's Library, lot 15 — le contrôleur et les meubles, de vrais événements
// de pointeur sur un canvas (le rendu est remplacé : happy-dom n'a pas de
// contexte 2D) :
//   * en `walk`, un appui sur un meuble PROPOSÉ (son action est nommée) →
//     marche vers sa case d'accès + `onPlayerWalk(case, intention)`, puis
//     `onPlayerArrive(case, direction, posture)` et `onPlayerPosture` ;
//   * les zones déclarées (lots 7 à 9) gardent la priorité ; sans nom
//     d'action, aucun meuble n'est proposé ; en mode déco, jamais ;
//   * « Se lever » relève sur place (présence sans posture) ; passer en mode
//     déco relève ; se servir d'un meuble → `onFurnitureUse` ;
//   * le survol d'un meuble proposé : main, nom de l'action, contour.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor as waitForDefault } from '@testing-library/react';

/** Une marche de quelques cases dure plus que le délai par défaut (1 s). */
const waitFor = (fn: () => void) => waitForDefault(fn, { timeout: 5_000 });

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
import { isWalking } from '../../features/player/library/engine/motion';
import { gridToScreen } from '../../features/player/library/engine/projection';
import type { RoomItem } from '../../features/player/library/engine/room';

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

/** Un fauteuil (2 × 2, remplaçant) tourné vers +x : sa case d'accès est (5, 7). */
const ARMCHAIR: RoomItem = {
  id: 'chair1',
  key: 'armchair',
  gx: 3,
  gy: 6,
  r: 1,
};
/** Son image, au-dessus de l'assise. */
const ON_CHAIR = gridToScreen(4, 7, 0.6);

function mount(over: Partial<ControllerOptions> = {}) {
  const opts = {
    onPlayerWalk: vi.fn(),
    onPlayerArrive: vi.fn(),
    onPlayerPosture: vi.fn(),
    onFurnitureUse: vi.fn(),
    onTilePointer: vi.fn(),
    onHotspotTap: vi.fn(),
  };
  ctrl = new LibraryController(canvas, container, {
    room: { w: 14, d: 12, wallHeight: 2.6, items: [ARMCHAIR] },
    playerId: 'me',
    playerStart: { i: 7, j: 7 },
    interactions: { labels: { sit: 'S’asseoir', read: 'Lire' } },
    ...opts,
    ...over,
  });
  return { ctrl, ...opts };
}

function pointer(type: string, x: number, y: number, pressed = true) {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: pressed ? 1 : 0,
      clientX: x,
      clientY: y,
      bubbles: true,
    })
  );
}
function tap(p: { x: number; y: number }) {
  pointer('pointerdown', p.x, p.y);
  pointer('pointerup', p.x, p.y);
}

describe('LibraryController — les meubles (lot 15)', () => {
  it('un appui sur un fauteuil : elle y va, s’assoit, et tout est annoncé', async () => {
    const { ctrl: c, onPlayerWalk, onPlayerArrive, onPlayerPosture } = mount();
    tap(ON_CHAIR);
    expect(onPlayerWalk).toHaveBeenCalledWith(
      { i: 5, j: 7 },
      { kind: 'seat', itemId: 'chair1', spot: 0 }
    );
    await waitFor(() =>
      expect(onPlayerArrive).toHaveBeenCalledWith({ i: 5, j: 7 }, 3, {
        kind: 'seat',
        itemId: 'chair1',
        spot: 0,
        pose: 'sit',
      })
    );
    expect(onPlayerArrive).toHaveBeenCalledTimes(1);
    expect(onPlayerPosture).toHaveBeenLastCalledWith({
      kind: 'seat',
      itemId: 'chair1',
      spot: 0,
      pose: 'sit',
    });
    expect(canvas.dataset.playerPosture).toBe('seat:chair1:0');

    // « Se lever » : sur place, la présence repart sans posture.
    c.standUp();
    expect(onPlayerPosture).toHaveBeenLastCalledWith(null);
    expect(onPlayerArrive).toHaveBeenLastCalledWith({ i: 5, j: 7 }, 3);
  });

  it('assise, un appui sur le sol la relève et la fait marcher', async () => {
    const { onPlayerWalk, onPlayerArrive, onPlayerPosture, ctrl: c } = mount();
    tap(ON_CHAIR);
    await waitFor(() => expect(onPlayerArrive).toHaveBeenCalledTimes(1));
    const floor = gridToScreen(8.5, 9.5);
    tap(floor);
    expect(onPlayerWalk).toHaveBeenLastCalledWith({ i: 8, j: 9 });
    expect(onPlayerPosture).toHaveBeenLastCalledWith(null);
    expect(isWalking(c.world.avatar('me')!.walker)).toBe(true);
  });

  it('une zone déclarée garde la priorité sur le meuble', () => {
    const { onHotspotTap, onPlayerWalk } = mount({
      hotspots: [
        {
          id: 'zone',
          label: 'Zone',
          shape: { kind: 'item', itemId: 'chair1' },
        },
      ],
    });
    tap(ON_CHAIR);
    expect(onHotspotTap).toHaveBeenCalledTimes(1);
    expect(onPlayerWalk).not.toHaveBeenCalled();
  });

  it('sans nom d’action (pas proposé ici) : l’appui va au sol sous le pointeur', () => {
    const { onPlayerWalk, ctrl: c } = mount({ interactions: undefined });
    tap(ON_CHAIR);
    // Une marche simple (une seule case en argument), sans intention.
    for (const call of onPlayerWalk.mock.calls) expect(call).toHaveLength(1);
    expect(c.world.avatar('me')?.intent).toBeNull();
    // Proposé après coup (l'écran passe ses noms) : il l'est.
    c.setInteractions({ labels: { sit: 'S’asseoir' } });
    tap(ON_CHAIR);
    expect(onPlayerWalk).toHaveBeenLastCalledWith(
      { i: 5, j: 7 },
      { kind: 'seat', itemId: 'chair1', spot: 0 }
    );
  });

  it('mode déco : aucune interaction, et la joueuse se relève', async () => {
    const { ctrl: c, onPlayerArrive, onPlayerWalk, onTilePointer } = mount();
    tap(ON_CHAIR);
    await waitFor(() => expect(onPlayerArrive).toHaveBeenCalledTimes(1));
    c.setMode('edit');
    expect(c.world.avatar('me')?.posture).toBeNull();
    tap(ON_CHAIR);
    expect(onTilePointer).toHaveBeenCalled();
    expect(onPlayerWalk).toHaveBeenCalledTimes(1);
  });

  it('se servir d’un meuble : `onFurnitureUse` avec une ancre au-dessus de lui', async () => {
    const shelf: RoomItem = {
      id: 'shelf',
      key: 'bookshelf_filled',
      gx: 5,
      gy: 0,
      r: 0,
    };
    const { onFurnitureUse, onPlayerArrive } = mount({
      room: { w: 14, d: 12, wallHeight: 2.6, items: [shelf] },
    });
    tap(gridToScreen(6.5, 0.5, 1));
    await waitFor(() => expect(onFurnitureUse).toHaveBeenCalledTimes(1));
    const [use] = onFurnitureUse.mock.calls[0] as unknown as [
      { activity: string; itemId: string; anchor: { x: number; y: number } },
    ];
    expect(use.activity).toBe('read');
    expect(use.itemId).toBe('shelf');
    expect(use.anchor.y).toBeLessThan(gridToScreen(6.5, 0.5, 1).y);
    // Sans manifeste, un rayonnage inconnu des remplaçants fait 1 × 1 : on
    // se tient devant (5, 1), face à lui.
    expect(onPlayerArrive).toHaveBeenLastCalledWith({ i: 5, j: 1 }, 1, {
      kind: 'use',
      itemId: 'shelf',
      activity: 'read',
    });
  });

  it('le survol d’un meuble proposé : main, nom de l’action, contour', () => {
    const { ctrl: c } = mount();
    const spy = vi.spyOn(c, 'setSelection');
    pointer('pointermove', ON_CHAIR.x, ON_CHAIR.y, false);
    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.title).toBe('S’asseoir');
    expect(canvas.dataset.furniture).toBe('chair1');
    expect(spy).toHaveBeenLastCalledWith('chair1');
    pointer('pointermove', 2, 2, false);
    expect(canvas.title).toBe('');
    expect(canvas.dataset.furniture).toBe('');
  });
});
