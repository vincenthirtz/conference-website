// @vitest-environment happy-dom
//
// Women's Library, lot 5 phase B — le contrôleur et les autres joueuses, de
// vrais événements de pointeur sur un canvas (le rendu est remplacé : happy-dom
// n'a pas de contexte 2D) :
//   * en `walk`, un appui sur une autre joueuse → `onAvatarTap` (avec une
//     ancre au-dessus de sa tête), sans marcher ;
//   * un appui sur le sol → marche ET `onPlayerWalk(case)` ; l'arrivée →
//     `onPlayerArrive(case, direction)` ;
//   * sans gestionnaire (`false`), l'appui fait marcher ; en `edit`, aucun
//     `onAvatarTap` ;
//   * une synchronisation réveille la boucle ; ma bulle s'efface seule.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

vi.mock('../../features/player/library/engine/renderer', () => ({
  LibraryRenderer: class {
    manifest = null;
    playerId: string | null = null;
    ghost = null;
    selectedId = null;
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
import type { RemoteAvatarInput } from '../../features/player/library/engine/remotes';

const IRIS = '00000000-0000-4000-8000-000000000011';

const IRIS_AT: RemoteAvatarInput = {
  id: IRIS,
  nickname: 'Iris',
  avatarId: null,
  tile: { i: 4, j: 4 },
  dir: 4,
  target: null,
  bubble: null,
};

let canvas: HTMLCanvasElement;
let container: HTMLDivElement;
let ctrl: LibraryController | null = null;

beforeEach(() => {
  // Pas de manifeste : remplaçants.
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
    onPlayerArrive: vi.fn(),
    onTilePointer: vi.fn(),
  };
  // Cadre de 0 × 0 (happy-dom) : la caméra reste à l'origine, zoom 1 — un
  // point du monde est un point du canvas.
  ctrl = new LibraryController(canvas, container, {
    room: { w: 14, d: 12, wallHeight: 2.6, items: [] },
    playerId: 'me',
    playerStart: { i: 10, j: 10 },
    ...opts,
    ...over,
  });
  return { ctrl, ...opts };
}

function tap(x: number, y: number) {
  const init = {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
  };
  canvas.dispatchEvent(new PointerEvent('pointerdown', init));
  canvas.dispatchEvent(new PointerEvent('pointerup', init));
}

describe('LibraryController — les autres joueuses', () => {
  it('un appui sur une autre joueuse ouvre son menu, sans marcher', () => {
    const { ctrl: c, onAvatarTap, onPlayerWalk } = mount();
    c.syncRemoteAvatars([IRIS_AT]);
    const torso = gridToScreen(4.5, 4.5, 1.0);
    tap(torso.x, torso.y);
    expect(onAvatarTap).toHaveBeenCalledTimes(1);
    const [arg] = onAvatarTap.mock.calls[0] as unknown as [
      { userId: string; anchor: { x: number; y: number } },
    ];
    expect(arg.userId).toBe(IRIS);
    // L'ancre est au-dessus de la tête, à l'aplomb des pieds.
    expect(arg.anchor.y).toBeLessThan(torso.y);
    expect(arg.anchor.x).toBeCloseTo(torso.x, 6);
    expect(c.avatarAnchor(IRIS)).toEqual(arg.anchor);
    expect(onPlayerWalk).not.toHaveBeenCalled();
    expect(isWalking(c.world.avatar('me')!.walker)).toBe(false);
  });

  it('un appui sur le sol marche, annonce la case visée, puis l’arrivée', async () => {
    const { ctrl: c, onAvatarTap, onPlayerWalk, onPlayerArrive } = mount();
    c.syncRemoteAvatars([IRIS_AT]);
    const floor = gridToScreen(10.5, 9.5);
    tap(floor.x, floor.y);
    expect(onAvatarTap).not.toHaveBeenCalled();
    expect(onPlayerWalk).toHaveBeenCalledWith({ i: 10, j: 9 });
    // Un pas (0, −1) se fait face au haut-droite de l'écran : direction 1.
    await waitFor(() =>
      expect(onPlayerArrive).toHaveBeenCalledWith({ i: 10, j: 9 }, 1)
    );
    expect(onPlayerArrive).toHaveBeenCalledTimes(1);
    // Sa propre case : aucun message.
    tap(floor.x, floor.y);
    expect(onPlayerWalk).toHaveBeenCalledTimes(1);
  });

  it('sans gestionnaire, l’appui sur une joueuse fait marcher ; en mode déco, jamais de menu', () => {
    const declined = vi.fn(() => false);
    const {
      ctrl: c,
      onPlayerWalk,
      onTilePointer,
    } = mount({
      onAvatarTap: declined,
    });
    c.syncRemoteAvatars([IRIS_AT]);
    const feet = gridToScreen(4.5, 4.5, 0.05);
    tap(feet.x, feet.y);
    expect(declined).toHaveBeenCalledTimes(1);
    expect(onPlayerWalk).toHaveBeenCalledWith({ i: 4, j: 4 });

    c.setMode('edit');
    const torso = gridToScreen(4.5, 4.5, 1.0);
    tap(torso.x, torso.y);
    expect(declined).toHaveBeenCalledTimes(1);
    expect(onTilePointer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'tap' })
    );
  });

  it('une synchronisation réveille la boucle ; ma bulle s’efface seule', async () => {
    const { ctrl: c } = mount({ bubbleMs: 60 });
    c.syncRemoteAvatars([IRIS_AT]);
    await waitFor(() => expect(canvas.dataset.remoteAvatars).toBe('1'));
    c.syncRemoteAvatars([]);
    await waitFor(() => expect(canvas.dataset.remoteAvatars).toBe('0'));

    c.showPlayerBubble({ key: 'me:1', glyph: '👋', text: 'Saluer' });
    expect(c.world.avatar('me')?.bubble?.text).toBe('Saluer');
    await waitFor(() => expect(c.world.avatar('me')?.bubble).toBeNull());

    c.setPlayerMarker('discrète');
    expect(c.world.avatar('me')?.marker).toBe('discrète');
  });
});
