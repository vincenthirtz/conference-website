// @vitest-environment happy-dom
//
// Women's Library, lot 16 — le fantôme d'Halloween DANS LE MOTEUR
// (`engine/npcLayer.ts`, son branchement dans `hotspots.ts`, `renderer.ts`,
// `avatarOverlays.ts` et `controller.ts`) :
//   * sa position est celle de la ronde à l'heure dite ; il flotte, sans
//     balancement si la joueuse refuse les animations ; hors de l'affiche il
//     n'est pas là (sauf en développement) ;
//   * « Bouh ! » au-dessus de lui quand il frôle un avatar, une fois par
//     attente, et la bulle s'efface ;
//   * dessin : ombre puis image (opacité, ancre, hauteur de vol) ; trié avec
//     les meubles et les avatars ;
//   * la boucle : ~30 images/s quand lui seul bouge, éveillée seulement
//     quand il est à l'écran, une minuterie d'une seconde sinon, effacée à
//     la fin ;
//   * dans le contrôleur, en `walk` : une autre joueuse d'abord, PUIS le
//     fantôme (son appui part comme une zone), PUIS les zones, PUIS le sol.

import fs from 'node:fs';
import path from 'node:path';
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

import type { ImageCache } from '../../features/player/library/engine/assets';
import { avatarOverlays } from '../../features/player/library/engine/avatarOverlays';
import {
  type ControllerOptions,
  LibraryController,
} from '../../features/player/library/engine/controller';
import { depthSort } from '../../features/player/library/engine/depthSort';
import { isWalking } from '../../features/player/library/engine/motion';
import {
  NpcLayer,
  type NpcOptions,
} from '../../features/player/library/engine/npcLayer';
import {
  type Camera,
  gridToScreen,
  worldToCanvas,
} from '../../features/player/library/engine/projection';
import { itemBox } from '../../features/player/library/engine/room';
import { stanceBox } from '../../features/player/library/engine/stance';
import { LibraryWorld } from '../../features/player/library/engine/world';
import { BOO_COOLDOWN_MS } from '../../features/player/library/halloween/boo';
import {
  GHOST_HOVER_M,
  ghostPoseAt,
  hallGhostRoute,
} from '../../features/player/library/halloween/ghostRoute';

const NPC_JSON = fs.readFileSync(
  path.resolve(__dirname, '../../public/library/spike/npc/npc.json'),
  'utf8'
);
const IN_SEASON = Date.parse('2026-10-21T18:00:00+02:00');
const AFTER = Date.parse('2026-11-01T00:00:00+01:00');
const route = hallGhostRoute();
if (!route) throw new Error('ronde attendue');
const CAM: Camera = { x: 0, y: 0, zoom: 1 };

/** Le fantôme EN MARCHE (hors pause) à un instant de la saison. */
function movingAt(): number {
  for (let t = IN_SEASON; t < IN_SEASON + 120_000; t += 250)
    if (route && !ghostPoseAt(route, t).paused) return t;
  throw new Error('jamais en marche');
}

let clock = IN_SEASON;
const fakeImg = { width: 128, height: 193 } as unknown as HTMLImageElement;
const images = { get: vi.fn(() => fakeImg) } as unknown as ImageCache;

beforeEach(() => {
  clock = IN_SEASON;
  // L'index des PNJ ; tout le reste (le manifeste) : absent.
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) =>
    String(url).includes('/npc/npc.json')
      ? new Response(NPC_JSON, { status: 200 })
      : new Response('{}', { status: 404 })
  ) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function layer(over: Partial<NpcOptions> = {}) {
  const loop = { request: vi.fn() };
  const npc = new NpcLayer(
    {
      kind: 'halloween',
      spotId: 'halloween',
      booText: 'Bouh !',
      label: 'Le fantôme',
      reducedMotion: false,
      now: () => clock,
      ...over,
    },
    images,
    loop
  );
  await flush();
  await flush();
  return { npc, loop };
}

const emptyWorld = () => ({ avatars: [], bubbleMs: 4_000 });

describe('NpcLayer — où il est', () => {
  it('rien avant ses images ; puis la ronde à l’heure dite, qui flotte', async () => {
    const loop = { request: vi.fn() };
    const npc = new NpcLayer(
      {
        kind: 'halloween',
        spotId: 'halloween',
        booText: 'B',
        now: () => clock,
      },
      images,
      loop
    );
    npc.step(emptyWorld());
    expect(npc.pose).toBeNull();
    await flush();
    await flush();
    expect(loop.request).toHaveBeenCalled();
    npc.step(emptyWorld());
    const expected = route && ghostPoseAt(route, clock);
    expect(npc.pose?.x).toBeCloseTo(expected?.x ?? Number.NaN, 9);
    expect(npc.pose?.y).toBeCloseTo(expected?.y ?? Number.NaN, 9);
  });

  it('sans animation : pas de balancement, à sa hauteur de vol', async () => {
    const { npc } = await layer({ reducedMotion: true });
    for (const t of [IN_SEASON, IN_SEASON + 700, IN_SEASON + 1_300]) {
      clock = t;
      npc.step(emptyWorld());
      expect(npc.pose?.z).toBe(GHOST_HOVER_M);
      expect(npc.pose?.bob).toBe(0);
    }
  });

  it('après l’affiche : parti ; en développement (`ignoreWindow`) : là', async () => {
    clock = AFTER;
    const { npc } = await layer();
    npc.step(emptyWorld());
    expect(npc.pose).toBeNull();
    expect(npc.box()).toBeNull();
    const dev = (await layer({ ignoreWindow: true })).npc;
    dev.step(emptyWorld());
    expect(dev.pose).not.toBeNull();
  });
});

describe('NpcLayer — « Bouh ! »', () => {
  it('au-dessus de lui quand il frôle un avatar, une fois par attente', async () => {
    const { npc } = await layer();
    const world = new LibraryWorld(
      { w: 28, d: 22, wallHeight: 2.8, items: [] },
      {}
    );
    npc.step(world);
    const p = npc.pose;
    if (!p) throw new Error('fantôme attendu');
    // Une avatar juste à côté de lui.
    world.addAvatar('iris', { i: Math.floor(p.x), j: Math.floor(p.y) }, 0);
    npc.step(world);
    const first = npc.overlay(CAM);
    expect(first?.bubble).toEqual({ glyph: '👻', text: 'Bouh !' });
    // La tête du fantôme, au-dessus de son image.
    expect(first?.head.y).toBeLessThan(gridToScreen(p.x, p.y, p.z).y);
    // Avec celles des avatars, dans l'ordre du fond vers l'avant.
    world.npc = npc;
    expect(avatarOverlays(world, CAM).map((o) => o.id)).toContain('npc');
    // La bulle s'efface au bout de sa durée…
    clock += world.bubbleMs + 1;
    npc.step({ avatars: [], bubbleMs: world.bubbleMs });
    expect(npc.overlay(CAM)).toBeNull();
    // … et la même avatar n'a pas de nouveau « bouh » avant l'attente.
    npc.step(world);
    expect(npc.overlay(CAM)).toBeNull();
    clock = IN_SEASON + BOO_COOLDOWN_MS + 50;
    // Elle le suit : toujours tout près de lui.
    npc.step({ avatars: [], bubbleMs: world.bubbleMs });
    const q = npc.pose;
    if (!q) throw new Error('fantôme attendu');
    world.placeAvatar('iris', { i: Math.floor(q.x), j: Math.floor(q.y) });
    npc.step(world);
    expect(npc.overlay(CAM)?.bubble?.text).toBe('Bouh !');
  });
});

describe('NpcLayer — dessin, appui, boucle', () => {
  function fakeCtx() {
    const calls: string[] = [];
    const ctx = {
      globalAlpha: 1,
      save: vi.fn(() => calls.push('save')),
      restore: vi.fn(() => calls.push('restore')),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(() => calls.push('arc')),
      fill: vi.fn(() => calls.push('fill')),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      drawImage: vi.fn(function (this: { globalAlpha: number }) {
        calls.push(`image@${this.globalAlpha}`);
      }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, calls };
  }

  it('une ombre au sol, puis son image posée par son ancre, en transparence', async () => {
    clock = movingAt();
    const { npc } = await layer();
    npc.step(emptyWorld());
    const p = npc.pose;
    if (!p) throw new Error('fantôme attendu');
    const { ctx, raw, calls } = fakeCtx();
    npc.drawShadow(ctx);
    expect(calls).toContain('arc');
    // L'ombre est au sol, sous lui.
    const foot = gridToScreen(p.x, p.y, 0);
    expect(raw.translate).toHaveBeenCalledWith(foot.x, foot.y);
    expect(npc.draw(ctx)).toBe(true);
    expect(calls).toContain('image@0.92');
    const index = JSON.parse(NPC_JSON);
    const [w, h, ax, ay] = index.npcs.ghost.d[p.dir];
    const o = gridToScreen(p.x, p.y, p.z);
    expect(raw.drawImage).toHaveBeenCalledWith(
      fakeImg,
      o.x - ax / 2,
      o.y - ay / 2,
      w / 2,
      h / 2
    );
  });

  it('trié avec les meubles et les avatars : derrière ce qui est devant lui', async () => {
    clock = movingAt();
    const { npc } = await layer();
    npc.step(emptyWorld());
    const box = npc.box();
    const p = npc.pose;
    if (!box || !p) throw new Error('fantôme attendu');
    // Il flotte : sa boîte commence au-dessus du sol.
    expect(box.minZ).toBeGreaterThan(0);
    const spec = { footprint: { w: 2, d: 2 }, height: 1 };
    const front = itemBox(
      {
        id: 'f',
        key: 'k',
        gx: Math.floor(p.x) + 1,
        gy: Math.floor(p.y) + 1,
        r: 0,
      },
      spec
    );
    const back = itemBox(
      {
        id: 'b',
        key: 'k',
        gx: Math.floor(p.x) - 2,
        gy: Math.floor(p.y) - 2,
        r: 0,
      },
      spec
    );
    const order = depthSort([
      { id: 'front', box: front },
      { id: 'npc', box },
      { id: 'back', box: back },
    ]).map((d) => d.id);
    expect(order).toEqual(['back', 'npc', 'front']);
    // Une avatar juste devant lui passe devant.
    const w = new LibraryWorld(
      { w: 28, d: 22, wallHeight: 2.8, items: [] },
      {}
    );
    const a = w.addAvatar(
      'iris',
      { i: Math.floor(p.x) + 1, j: Math.floor(p.y) + 1 },
      0
    );
    expect(
      depthSort([
        { id: 'iris', box: stanceBox(a) },
        { id: 'npc', box },
      ]).map((d) => d.id)
    ).toEqual(['npc', 'iris']);
  });

  it('se vise par son drap ; ailleurs, rien', async () => {
    clock = movingAt();
    const { npc } = await layer();
    npc.step(emptyWorld());
    const p = npc.pose;
    if (!p) throw new Error('fantôme attendu');
    const body = gridToScreen(p.x, p.y, p.z + 0.5);
    expect(npc.spotAt(body.x, body.y)).toMatchObject({
      id: 'halloween',
      label: 'Le fantôme',
    });
    const far = gridToScreen(p.x + 6, p.y + 6, 0);
    expect(npc.spotAt(far.x, far.y)).toBeNull();
  });

  it('~30 images/s quand lui seul bouge ; à chaque image sinon', async () => {
    const { npc } = await layer();
    npc.step(emptyWorld());
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1_000);
    expect(npc.throttle(false)).toBe(false);
    now.mockReturnValue(1_016);
    expect(npc.throttle(false)).toBe(true);
    expect(npc.throttle(true)).toBe(false);
    now.mockReturnValue(1_050);
    expect(npc.throttle(false)).toBe(false);
  });

  it('éveillée à l’écran ; hors de l’écran, une minuterie d’une seconde, effacée à la fin', async () => {
    const { npc, loop } = await layer();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    npc.step(emptyWorld());
    const p = npc.pose;
    if (!p) throw new Error('fantôme attendu');
    // La caméra le montre au milieu d'un cadre de 800 × 600.
    const foot = gridToScreen(p.x, p.y, 0);
    const onScreen = { x: 400 - foot.x, y: 400 - foot.y, zoom: 1 };
    npc.markVisible(onScreen, 800, 600);
    expect(npc.awake()).toBe(true);
    // Loin de lui : la boucle s'arrête, une minuterie reviendra voir.
    npc.markVisible({ x: -5_000, y: -5_000, zoom: 1 }, 800, 600);
    loop.request.mockClear();
    expect(npc.awake()).toBe(false);
    expect(npc.awake()).toBe(false); // une seule minuterie
    vi.advanceTimersByTime(999);
    expect(loop.request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(loop.request).toHaveBeenCalledTimes(1);
    // À la fin, plus rien.
    expect(npc.awake()).toBe(false);
    npc.dispose();
    vi.advanceTimersByTime(5_000);
    expect(loop.request).toHaveBeenCalledTimes(1);
    expect(npc.awake()).toBe(false);
  });

  it('sans fantôme (après l’affiche), ni boucle ni minuterie', async () => {
    clock = AFTER;
    const { npc, loop } = await layer();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    npc.step(emptyWorld());
    loop.request.mockClear();
    npc.markVisible(CAM, 800, 600);
    expect(npc.awake()).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(loop.request).not.toHaveBeenCalled();
    expect(npc.throttle(false)).toBe(false);
  });
});

/* ------------------------------------------------------ contrôleur --- */

describe('LibraryController — le fantôme dans l’ordre des appuis', () => {
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctrl: LibraryController | null = null;

  beforeEach(() => {
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

  async function mount(over: Partial<ControllerOptions> = {}) {
    const opts = {
      onAvatarTap: vi.fn(() => true),
      onHotspotTap: vi.fn(),
      onPlayerWalk: vi.fn(),
    };
    ctrl = new LibraryController(canvas, container, {
      room: { w: 28, d: 22, wallHeight: 2.8, items: [] },
      playerId: 'me',
      playerStart: { i: 26, j: 20 },
      npc: {
        kind: 'halloween',
        spotId: 'halloween',
        booText: 'Bouh !',
        label: 'Le fantôme',
        reducedMotion: true,
        now: () => clock,
      },
      ...opts,
      ...over,
    });
    const c = ctrl;
    // Le PNJ arrive à la demande (`npcHost`), puis ses images.
    if (over.npc !== null) {
      await vi.waitFor(() => expect(c.world.npc).not.toBeNull());
      await flush();
      await flush();
    }
    // Le rendu est remplacé : on avance le fantôme à la main.
    c.world.npc?.step(c.world);
    return { c, ...opts };
  }

  const pointer = (type: string, x: number, y: number) =>
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
  const tap = (x: number, y: number) => {
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  };

  it('sans option `npc`, pas de fantôme', async () => {
    const { c } = await mount({ npc: null });
    expect(c.world.npc).toBeNull();
  });

  it('un appui sur le fantôme part comme une zone (`halloween`), avant les zones, sans marcher', async () => {
    clock = movingAt();
    const { c, onHotspotTap, onPlayerWalk } = await mount();
    const p = c.world.npc?.pose;
    if (!p) throw new Error('fantôme attendu');
    // Une zone déclarée JUSTE sous lui : il passe avant.
    c.hotspots.set([
      {
        id: 'board',
        label: 'Panneau',
        shape: {
          kind: 'area',
          area: {
            minX: Math.floor(p.x) - 1,
            minY: Math.floor(p.y) - 1,
            maxX: Math.floor(p.x) + 2,
            maxY: Math.floor(p.y) + 2,
          },
          heightM: 2,
        },
      },
    ]);
    const body = worldToCanvas(gridToScreen(p.x, p.y, p.z + 0.5), CAM);
    tap(body.x, body.y);
    expect(onHotspotTap).toHaveBeenCalledTimes(1);
    const [arg] = onHotspotTap.mock.calls[0] as unknown as [
      { id: string; anchor: { x: number; y: number } },
    ];
    expect(arg.id).toBe('halloween');
    expect(arg.anchor.y).toBeLessThan(body.y);
    expect(onPlayerWalk).not.toHaveBeenCalled();
    expect(isWalking(c.world.avatar('me')!.walker)).toBe(false);
  });

  it('une autre joueuse devant lui passe d’abord', async () => {
    clock = movingAt();
    const { c, onAvatarTap, onHotspotTap } = await mount();
    const p = c.world.npc?.pose;
    if (!p) throw new Error('fantôme attendu');
    c.syncRemoteAvatars([
      {
        id: 'iris',
        nickname: 'Iris',
        avatarId: null,
        tile: { i: Math.floor(p.x), j: Math.floor(p.y) },
        dir: 4,
        target: null,
        bubble: null,
      },
    ]);
    const torso = gridToScreen(
      Math.floor(p.x) + 0.5,
      Math.floor(p.y) + 0.5,
      0.6
    );
    tap(torso.x, torso.y);
    expect(onAvatarTap).toHaveBeenCalledTimes(1);
    expect(onHotspotTap).not.toHaveBeenCalled();
  });

  it('ailleurs : le sol, on marche', async () => {
    clock = movingAt();
    const { c, onHotspotTap, onPlayerWalk } = await mount();
    const p = c.world.npc?.pose;
    if (!p) throw new Error('fantôme attendu');
    const tile = { i: 26, j: 3 };
    const floor = gridToScreen(tile.i + 0.5, tile.j + 0.5, 0);
    expect(c.world.npc?.spotAt(floor.x, floor.y)).toBeNull();
    tap(floor.x, floor.y);
    expect(onHotspotTap).not.toHaveBeenCalled();
    expect(onPlayerWalk).toHaveBeenCalled();
  });

  it('au survol : la main et son nom, sans case éclairée', async () => {
    clock = movingAt();
    const { c } = await mount();
    const p = c.world.npc?.pose;
    if (!p) throw new Error('fantôme attendu');
    const body = gridToScreen(p.x, p.y, p.z + 0.5);
    pointer('pointermove', body.x, body.y);
    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.title).toBe('Le fantôme');
    expect(canvas.dataset.hotspot).toBe('npc:halloween');
    const far = gridToScreen(26.5, 3.5, 0);
    pointer('pointermove', far.x, far.y);
    expect(canvas.title).toBe('');
    expect(canvas.style.cursor).toBe('');
  });
});
