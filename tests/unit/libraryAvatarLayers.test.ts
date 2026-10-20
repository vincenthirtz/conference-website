// tests/unit/libraryAvatarLayers.test.ts
//
// Women's Library, lot 13 — les avatars COMPOSÉS dans le moteur :
//   * l'index des calques (engine/avatarLayers.ts) : validé, un calque mal
//     formé est écarté sans faire tomber les autres ;
//   * un look → ses quatre calques, dans l'ordre (corps, bas, haut, cheveux),
//     avec leur teinte ;
//   * la mise en page d'une bande : les calques d'une image s'alignent sur leur
//     ANCRE au sol ;
//   * le cache LRU : borné en octets, sans chasser une bande servie dans
//     l'image en cours ;
//   * le compositeur (engine/lookCompositor.ts) sur un faux canvas : la teinte
//     est un `multiply` suivi d'un `destination-in`, une bande est composée UNE
//     fois puis servie du cache, et chaque manque retombe proprement
//     (marche → attente, sinon `false` : la feuille `avatarId`).

import { describe, expect, it, vi } from 'vitest';
import {
  encodeLibraryLook,
  LIBRARY_AVATAR_PRESETS,
  type LibraryAvatarLook,
} from '../../config/library/avatarLook';
import {
  type LayerRect,
  lookLayers,
  LruBudget,
  parseLayerIndex,
  STRIP_GUTTER,
  stripCellIndex,
  stripFrames,
  stripKeyOf,
  stripLayout,
  tintFor,
} from '../../features/player/library/engine/avatarLayers';
import {
  LookCompositor,
  type LookCanvas,
} from '../../features/player/library/engine/lookCompositor';
import { createWalker } from '../../features/player/library/engine/motion';
import {
  type AvatarEntity,
  LibraryWorld,
} from '../../features/player/library/engine/world';

const LOOK: LibraryAvatarLook = LIBRARY_AVATAR_PRESETS.a01;
const CODE = encodeLibraryLook(LOOK);

/* ---------------------------------------------------------- fixtures --- */

const rect = (x: number, w: number, h: number, ax: number, ay: number) => [
  x,
  0,
  w,
  h,
  ax,
  ay,
];

/** Une animation : `frames` images par direction, dans une feuille 1024². */
function anim(file: string, frames: number, w = 40, h = 100, ax = 20, ay = 90) {
  return {
    sheet: `/library/spike/avatars/layers/${file}`,
    width: 1024,
    height: 1024,
    fps: frames > 1 ? 10 : 1,
    ...(frames > 1 ? { strideMeters: 1.33 } : {}),
    directions: Array.from({ length: 8 }, () =>
      Array.from({ length: frames }, (_, i) => rect(i * 50, w, h, ax, ay))
    ),
  };
}

function layer(id: string, size?: [number, number, number, number]) {
  const [w, h, ax, ay] = size ?? [40, 100, 20, 90];
  return {
    idle: anim(`${id}-idle.webp`, 1, w, h, ax, ay),
    walk: anim(`${id}-walk.webp`, 8, w, h, ax, ay),
    sit: anim(`${id}-sit.webp`, 1, w, h, ax, ay),
  };
}

function indexFor(look: LibraryAvatarLook) {
  return {
    version: 1,
    tile: { width: 64, height: 32, meters: 0.5 },
    pixelRatio: 2,
    layers: {
      [`body.${look.skin}`]: layer(`body.${look.skin}`, [40, 100, 20, 90]),
      [`bottom.${look.outfit}`]: layer('bottom', [30, 50, 15, 45]),
      // Recadrage SERRÉ : l'ancre (au sol) tombe sous le haut et les cheveux.
      [`top.${look.outfit}`]: layer('top', [44, 40, 22, 70]),
      // Des cheveux plus larges à gauche de l'ancre : la cellule s'élargit.
      [`hair.${look.hair}`]: layer('hair', [60, 30, 36, 98]),
    },
  };
}

/** Un faux contexte 2D qui journalise ce qu'on lui fait. */
function fakeCanvas(log: string[], name: string): LookCanvas {
  const c = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    clearRect: () => log.push(`${name}:clear`),
    fillRect: () =>
      log.push(`${name}:fill:${ctx.globalCompositeOperation}:${ctx.fillStyle}`),
    drawImage: (src: { name?: string }) =>
      log.push(
        `${name}:draw:${ctx.globalCompositeOperation}:${src?.name ?? 'img'}`
      ),
  };
  return c as unknown as LookCanvas;
}

function harness(opts: {
  index?: unknown;
  ready?: (src: string) => boolean;
  budget?: number;
}) {
  const log: string[] = [];
  let n = 0;
  const requested: string[] = [];
  const images = {
    get: vi.fn((src: string) => {
      requested.push(src);
      return opts.ready && !opts.ready(src)
        ? null
        : ({ name: src.split('/').pop() } as unknown as CanvasImageSource);
    }),
  };
  const makeCanvas = vi.fn((w: number, h: number) => {
    const c = fakeCanvas(log, `c${n++}`);
    c.width = w;
    c.height = h;
    (c as unknown as { name: string }).name = `c${n - 1}`;
    return c;
  });
  const fetcher = vi.fn(async () => ({
    ok: opts.index !== undefined,
    json: async () => opts.index,
  }));
  const comp = new LookCompositor(images, makeCanvas, fetcher, opts.budget);
  return { comp, images, makeCanvas, fetcher, log, requested };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function entity(look: string | null, walking = false): AvatarEntity {
  const walker = createWalker({ i: 2, j: 3 });
  if (walking) walker.path = [{ i: 4, j: 3 }];
  return {
    id: 'me',
    kind: 'player',
    walker,
    avatarId: 'a01',
    look,
    hue: 0,
    isBot: false,
    wait: 0,
    label: null,
    marker: null,
    bubble: null,
    lastTargetAt: null,
  };
}

function fakeCtx() {
  const calls: unknown[][] = [];
  return {
    calls,
    ctx: {
      drawImage: (...args: unknown[]) => calls.push(args),
    } as unknown as CanvasRenderingContext2D,
  };
}

/* ------------------------------------------------------------- index --- */

describe('parseLayerIndex', () => {
  it('lit un index valide', () => {
    const idx = parseLayerIndex(indexFor(LOOK));
    expect(idx?.pixelRatio).toBe(2);
    expect(Object.keys(idx?.layers ?? {}).sort()).toEqual(
      [`body.s3`, 'bottom.tee', 'hair.bob', 'top.tee'].sort()
    );
    expect(idx?.layers['body.s3'].walk?.strideMeters).toBe(1.33);
    expect(idx?.layers['body.s3'].idle.directions[4]?.[0]).toEqual({
      x: 0,
      y: 0,
      w: 40,
      h: 100,
      ax: 20,
      ay: 90,
    });
  });

  it.each([
    ['autre version', { ...indexFor(LOOK), version: 2 }],
    [
      'autre case',
      { ...indexFor(LOOK), tile: { width: 64, height: 32, meters: 1 } },
    ],
    ['sans pixelRatio', { ...indexFor(LOOK), pixelRatio: 0 }],
    ['pas un objet', [1, 2]],
  ])('rejette en bloc : %s', (_l, json) => {
    expect(parseLayerIndex(json)).toBeNull();
  });

  it('écarte un calque mal formé, garde les autres', () => {
    const json = indexFor(LOOK);
    const bad = layer('x');
    bad.idle.directions[2] = [[0, 0, 2000, 10, 0, 0]]; // hors de la feuille
    const json2 = {
      ...json,
      layers: {
        ...json.layers,
        'hair.bob': bad,
        'hair.long': {
          ...layer('y'),
          idle: { ...layer('y').idle, sheet: 'https://ailleurs/x.webp' },
        },
        'nimporte.quoi': layer('z'),
        'top.tee': {
          ...layer('t'),
          walk: { ...layer('t').walk, directions: [] },
        },
        // Ancre hors du rect : permise (recadrage serré), mais bornée.
        'hair.afro': layer('a', [40, 20, -10, 300]),
        'hair.curly': layer('c', [40, 20, 20, 99_999]),
      },
    };
    const idx = parseLayerIndex(json2);
    expect(Object.keys(idx?.layers ?? {}).sort()).toEqual([
      'body.s3',
      'bottom.tee',
      'hair.afro',
    ]);
  });
});

/* ----------------------------------------------------------- calques --- */

describe('les calques d’un look', () => {
  it('corps, bas, haut, cheveux ; seul le corps n’est pas teinté', () => {
    const layers = lookLayers(LOOK);
    expect(layers.map((l) => l.id)).toEqual([
      'body.s3',
      'bottom.tee',
      'top.tee',
      'hair.bob',
    ]);
    expect(layers[0].tint).toBeNull();
    expect(layers.slice(1).every((l) => l.tint?.length === 3)).toBe(true);
    // Le haut prend `outfitColor` (raspberry), le bas `bottomColor` (navy).
    expect(layers[2].tint).toEqual(tintFor([180, 60, 110]));
    expect(layers[1].tint).toEqual(tintFor([38, 52, 88]));
  });

  it('tintFor éclaircit les tons moyens, garde noir et blanc', () => {
    expect(tintFor([0, 0, 0])).toEqual([0, 0, 0]);
    expect(tintFor([255, 255, 255])).toEqual([255, 255, 255]);
    const [mid] = tintFor([128, 128, 128]);
    expect(mid).toBeGreaterThan(128);
    expect(tintFor([300, -4, 255])).toEqual([255, 0, 255]);
  });
});

/* ------------------------------------------------------------ bandes --- */

describe('mise en page d’une bande', () => {
  const r = (w: number, h: number, ax: number, ay: number): LayerRect => ({
    x: 0,
    y: 0,
    w,
    h,
    ax,
    ay,
  });

  it('aligne les calques d’une image sur leur ancre', () => {
    const layout = stripLayout([
      [r(40, 100, 20, 90), r(40, 100, 20, 90)],
      [r(60, 30, 36, 98), r(10, 10, 5, 5)],
    ]);
    expect(layout).not.toBeNull();
    if (!layout) return;
    const [c0, c1] = layout.cells;
    // Image 0 : 36 px à gauche de l'ancre (cheveux), 24 à droite (60 − 36).
    expect(c0).toMatchObject({ x: STRIP_GUTTER, w: 60, ax: 36, ay: 98 });
    expect(c0.h).toBe(98 + 10);
    // Chaque calque posé de sorte que son ancre tombe sur celle de la cellule.
    const [body0] = layout.placements[0];
    const [hair0] = layout.placements[1];
    expect(body0.dx + 20).toBe(c0.x + c0.ax);
    expect(body0.dy + 90).toBe(c0.y + c0.ay);
    expect(hair0.dx + 36).toBe(c0.x + c0.ax);
    expect(hair0.dy + 98).toBe(c0.y + c0.ay);
    // Image 1 à droite de la 0, gouttière comprise.
    expect(c1.x).toBe(c0.x + c0.w + STRIP_GUTTER);
    expect(layout.width).toBe(c1.x + c1.w + STRIP_GUTTER);
  });

  it('refuse des calques au nombre d’images différent, ou trop larges', () => {
    expect(stripLayout([[r(1, 1, 0, 0)], []])).toBeNull();
    expect(stripLayout([])).toBeNull();
    expect(
      stripLayout([Array.from({ length: 3 }, () => r(2000, 10, 0, 0))])
    ).toBeNull();
  });

  it('attente et assise : les 8 directions ; marche : les 8 images d’une direction', () => {
    const idx = parseLayerIndex(indexFor(LOOK));
    const body = idx?.layers['body.s3'];
    if (!body?.walk) throw new Error('fixture');
    expect(stripFrames(body.idle, 'idle', 3)).toHaveLength(8);
    expect(stripFrames(body.walk, 'walk', 3)).toHaveLength(8);
    expect(stripKeyOf(CODE, 'idle', 3)).toBe(stripKeyOf(CODE, 'idle', 6));
    expect(stripKeyOf(CODE, 'walk', 3)).not.toBe(stripKeyOf(CODE, 'walk', 6));
    expect(stripCellIndex('idle', 5, 0)).toBe(5);
    expect(stripCellIndex('walk', 5, 2)).toBe(2);
  });
});

/* ------------------------------------------------------------ cache --- */

describe('LruBudget', () => {
  it('évince le moins récemment servi au-delà du budget', () => {
    const out: string[] = [];
    const lru = new LruBudget<string>(100, (v) => out.push(v));
    lru.set('a', 'A', 40);
    lru.nextFrame();
    lru.set('b', 'B', 40);
    lru.nextFrame();
    lru.get('a');
    lru.nextFrame();
    lru.set('c', 'C', 40);
    expect(out).toEqual(['B']);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.bytes).toBe(80);
  });

  it('ne chasse pas une entrée servie dans l’image en cours', () => {
    const out: string[] = [];
    const lru = new LruBudget<string>(50, (v) => out.push(v));
    lru.set('a', 'A', 40);
    lru.set('b', 'B', 40);
    expect(out).toEqual([]);
    expect(lru.bytes).toBe(80);
    lru.nextFrame();
    // Image suivante : le plus ancien sort, juste assez pour tenir le budget.
    lru.set('c', 'C', 10);
    expect(out).toEqual(['A']);
    expect(lru.bytes).toBe(50);
  });

  it('clear rend tout', () => {
    const out: string[] = [];
    const lru = new LruBudget<string>(50, (v) => out.push(v));
    lru.set('a', 'A', 10);
    lru.clear();
    expect(out).toEqual(['A']);
    expect(lru.size).toBe(0);
  });
});

/* -------------------------------------------------------- compositeur --- */

describe('LookCompositor', () => {
  it('sans look : false, rien n’est lu', () => {
    const { comp, fetcher } = harness({ index: indexFor(LOOK) });
    const { ctx } = fakeCtx();
    expect(comp.draw(ctx, entity(null), 1)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lit l’index au premier look, puis demande les feuilles d’attente', async () => {
    const { comp, fetcher, requested } = harness({ index: indexFor(LOOK) });
    const { ctx, calls } = fakeCtx();
    expect(comp.draw(ctx, entity(CODE), 1)).toBe(false);
    expect(comp.status).toBe('loading');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(comp.status).toBe('ready');
    // Les quatre feuilles d'attente demandées, jamais la marche.
    expect(requested.filter((s) => s.endsWith('-idle.webp'))).toHaveLength(4);
    expect(requested.some((s) => s.includes('-walk'))).toBe(false);
    expect(comp.draw(ctx, entity(CODE), 2)).toBe(true);
    expect(calls).toHaveLength(1);
    // Posée par l'ancre (px d'image / pixelRatio 2) sous les pieds.
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = calls[0] as number[];
    expect(dw).toBe(sw / 2);
    expect(dh).toBe(sh / 2);
    expect(sx).toBeGreaterThanOrEqual(STRIP_GUTTER);
    expect(sy).toBe(STRIP_GUTTER);
    expect(Number.isFinite(dx) && Number.isFinite(dy)).toBe(true);
  });

  it('teinte : multiply puis destination-in ; le corps est posé tel quel', async () => {
    const { comp, log } = harness({ index: indexFor(LOOK) });
    comp.strip(CODE, 'idle', 4);
    await flush();
    expect(comp.strip(CODE, 'idle', 4)).not.toBeNull();
    // c0 = la bande ; c1 = gris ; c2 = teinté.
    const out = log.filter((l) => l.startsWith('c0:'));
    expect(out.slice(0, 8)).toEqual(
      Array.from({ length: 8 }, () => 'c0:draw:source-over:body.s3-idle.webp')
    );
    expect(out.slice(8)).toEqual([
      'c0:draw:source-over:c2',
      'c0:draw:source-over:c2',
      'c0:draw:source-over:c2',
    ]);
    const tinted = log.filter((l) => l.startsWith('c2:'));
    expect(tinted.slice(0, 5)).toEqual([
      'c2:clear',
      'c2:draw:source-over:c1',
      `c2:fill:multiply:rgb(${tintFor([38, 52, 88]).join(', ')})`,
      'c2:draw:destination-in:c1',
      'c2:clear',
    ]);
  });

  it('compose une bande UNE fois, puis la sert du cache', async () => {
    const { comp, makeCanvas } = harness({ index: indexFor(LOOK) });
    const { ctx } = fakeCtx();
    comp.draw(ctx, entity(CODE), 1);
    await flush();
    for (let f = 2; f < 30; f++)
      expect(comp.draw(ctx, entity(CODE), f)).toBe(true);
    expect(comp.composed).toBe(1);
    // Une bande + deux canvas de travail.
    expect(makeCanvas).toHaveBeenCalledTimes(3);
    expect(comp.cacheBytes).toBeGreaterThan(0);
  });

  it('la marche pas encore décodée : l’avatar glisse en attente, puis marche', async () => {
    let walkReady = false;
    const { comp, requested } = harness({
      index: indexFor(LOOK),
      ready: (src) => !src.includes('-walk') || walkReady,
    });
    const { ctx } = fakeCtx();
    comp.draw(ctx, entity(CODE, true), 1);
    await flush();
    expect(comp.draw(ctx, entity(CODE, true), 2)).toBe(true);
    expect(requested.filter((s) => s.includes('-walk'))).toHaveLength(4);
    expect(comp.composed).toBe(1);
    walkReady = true;
    expect(comp.draw(ctx, entity(CODE, true), 3)).toBe(true);
    expect(comp.composed).toBe(2);
  });

  it('feuille pas prête, calque absent, index introuvable : false (repli avatarId)', async () => {
    const notReady = harness({ index: indexFor(LOOK), ready: () => false });
    const { ctx } = fakeCtx();
    notReady.comp.draw(ctx, entity(CODE), 1);
    await flush();
    expect(notReady.comp.draw(ctx, entity(CODE), 2)).toBe(false);

    const other = encodeLibraryLook({ ...LOOK, hair: 'afro' });
    const missing = harness({ index: indexFor(LOOK) });
    missing.comp.draw(ctx, entity(other), 1);
    await flush();
    expect(missing.comp.draw(ctx, entity(other), 2)).toBe(false);

    const failed = harness({});
    failed.comp.draw(ctx, entity(CODE), 1);
    await flush();
    expect(failed.comp.status).toBe('failed');
    expect(failed.comp.draw(ctx, entity(CODE), 2)).toBe(false);
    expect(failed.fetcher).toHaveBeenCalledTimes(1);

    const bogus = harness({ index: indexFor(LOOK) });
    expect(bogus.comp.draw(ctx, entity('9zzzzzz'), 1)).toBe(false);
  });

  it('30 looks différents à l’écran ne se chassent pas, même au-delà du budget', async () => {
    const looks = Array.from({ length: 30 }, (_, k) =>
      encodeLibraryLook({
        ...LOOK,
        outfitColor: k % 2 ? 'red' : 'navy',
        bottomColor: (['white', 'black', 'grey', 'olive', 'beige'] as const)[
          k % 5
        ],
        hairColor: (['black', 'honey', 'rose'] as const)[k % 3],
      })
    );
    const { comp } = harness({ index: indexFor(LOOK), budget: 1 });
    const { ctx } = fakeCtx();
    comp.draw(ctx, entity(looks[0]), 0);
    await flush();
    for (let frame = 1; frame <= 3; frame++)
      for (const code of looks) comp.draw(ctx, entity(code), frame);
    // 30 codes, mais seulement 30 combinaisons distinctes au plus : chacune
    // composée une fois à la première image, puis servie (pas de rechasse).
    const distinct = new Set(looks).size;
    expect(comp.composed).toBe(distinct);
  });

  it('dispose vide le cache', async () => {
    const { comp } = harness({ index: indexFor(LOOK) });
    comp.strip(CODE, 'idle', 0);
    await flush();
    comp.strip(CODE, 'idle', 0);
    expect(comp.cacheBytes).toBeGreaterThan(0);
    comp.dispose();
    expect(comp.cacheBytes).toBe(0);
  });
});

/* ------------------------------------------------------------- monde --- */

describe('le monde porte le look', () => {
  const room = { w: 8, d: 8, wallHeight: 2.8, items: [] };

  it('la joueuse : setLook ; les autres : depuis la présence', () => {
    const world = new LibraryWorld(room as never, {});
    world.addAvatar('me', { i: 1, j: 1 }, 0, false, 'a01');
    expect(world.avatar('me')?.look).toBeNull();
    world.setLook('me', CODE);
    expect(world.avatar('me')?.look).toBe(CODE);

    const remote = {
      id: '00000000-0000-4000-8000-000000000001',
      nickname: 'Iris',
      avatarId: 'a05',
      tile: { i: 2, j: 2 },
      dir: 4 as const,
      target: null,
      bubble: null,
    };
    world.syncRemoteAvatars([{ ...remote, look: CODE }], 0);
    expect(world.avatar(remote.id)?.look).toBe(CODE);
    world.syncRemoteAvatars([remote], 1);
    expect(world.avatar(remote.id)?.look).toBeNull();
  });
});
