import { describe, expect, it } from 'vitest';
import { FrameLoop } from '../../features/player/library/engine/loop';
import {
  advanceWalker,
  createWalker,
  DEFAULT_WALK_SPEED,
  directionFromDelta,
  headingTile,
  isWalking,
  mirrorDirection,
  setWalkerPath,
  spriteDirection,
  WALK_SPEED_MPS,
  walkerTile,
  type Direction,
} from '../../features/player/library/engine/motion';
import {
  gridToScreen,
  METERS_PER_TILE,
} from '../../features/player/library/engine/projection';
import { LibraryWorld } from '../../features/player/library/engine/world';

describe('directionFromDelta — 0 = haut de l’écran, sens horaire', () => {
  const cases: Array<[number, number, Direction, string]> = [
    [-1, -1, 0, 'N (haut)'],
    [0, -1, 1, 'NE'],
    [1, -1, 2, 'E (droite)'],
    [1, 0, 3, 'SE'],
    [1, 1, 4, 'S (bas)'],
    [0, 1, 5, 'SO'],
    [-1, 1, 6, 'O (gauche)'],
    [-1, 0, 7, 'NO'],
  ];
  for (const [dx, dy, dir, label] of cases) {
    it(`(${dx}, ${dy}) → ${dir} ${label}`, () => {
      expect(directionFromDelta(dx, dy)).toBe(dir);
      // Le vecteur écran confirme l'étiquette.
      const s = gridToScreen(dx, dy);
      const o = gridToScreen(0, 0);
      const angle = Math.atan2(s.x - o.x, -(s.y - o.y));
      const delta = angle - (dir * Math.PI) / 4;
      const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));
      expect(Math.abs(wrapped)).toBeLessThan(Math.PI / 4);
    });
  }

  it('déplacement nul : null ; longueur sans effet', () => {
    expect(directionFromDelta(0, 0)).toBeNull();
    expect(directionFromDelta(0.3, 0)).toBe(3);
    expect(directionFromDelta(-5, 5)).toBe(6);
  });

  it('miroir horizontal : d ↔ (8 − d) mod 8 ; 5 directions rendues', () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7].map((d) => mirrorDirection(d as Direction))
    ).toEqual([0, 7, 6, 5, 4, 3, 2, 1]);
    expect(spriteDirection(2)).toEqual({ base: 2, mirrored: false });
    expect(spriteDirection(6)).toEqual({ base: 2, mirrored: true });
    expect(spriteDirection(7)).toEqual({ base: 1, mirrored: true });
    expect(spriteDirection(5)).toEqual({ base: 3, mirrored: true });
  });
});

describe('advanceWalker — vitesse constante le long du trajet', () => {
  it('ligne droite : position interpolée, arrêt au bout, orientation SE', () => {
    const w = createWalker({ i: 0, j: 0 }, 2);
    setWalkerPath(w, [
      { i: 0, j: 0 },
      { i: 1, j: 0 },
      { i: 2, j: 0 },
    ]);
    expect(w.path).toHaveLength(2); // la case de départ est retirée
    advanceWalker(w, 0.25);
    expect(w.x).toBeCloseTo(1, 12);
    expect(w.y).toBeCloseTo(0.5, 12);
    expect(w.dir).toBe(3);
    advanceWalker(w, 0.5);
    expect(w.x).toBeCloseTo(2, 12);
    advanceWalker(w, 10);
    expect(w.x).toBeCloseTo(2.5, 12);
    expect(isWalking(w)).toBe(false);
    expect(w.travelled).toBeCloseTo(2, 12);
    expect(advanceWalker(w, 1)).toBe(false);
  });

  it('diagonale : √2 par pas, même vitesse', () => {
    const w = createWalker({ i: 0, j: 0 }, 2);
    setWalkerPath(w, [
      { i: 0, j: 0 },
      { i: 1, j: 1 },
    ]);
    advanceWalker(w, 0.5); // 1 case parcourue sur √2
    expect(w.x).toBeCloseTo(0.5 + Math.SQRT1_2, 12);
    expect(w.y).toBeCloseTo(0.5 + Math.SQRT1_2, 12);
    expect(w.dir).toBe(4);
    expect(isWalking(w)).toBe(true);
  });

  it('le reliquat d’un pas passe au suivant (virage sans perte)', () => {
    const w = createWalker({ i: 0, j: 0 }, 1);
    setWalkerPath(w, [
      { i: 0, j: 0 },
      { i: 1, j: 0 },
      { i: 1, j: 1 },
    ]);
    advanceWalker(w, 1.5);
    expect(w.x).toBeCloseTo(1.5, 12);
    expect(w.y).toBeCloseTo(1, 12);
    expect(w.dir).toBe(5);
    expect(w.travelled).toBeCloseTo(1.5, 12);
  });

  it('un même trajet donne la même position, en un pas ou en cent', () => {
    const path = [
      { i: 2, j: 2 },
      { i: 3, j: 3 },
      { i: 4, j: 3 },
      { i: 4, j: 4 },
    ];
    const a = createWalker({ i: 2, j: 2 }, 1.7);
    const b = createWalker({ i: 2, j: 2 }, 1.7);
    setWalkerPath(a, path);
    setWalkerPath(b, path);
    advanceWalker(a, 1.3);
    for (let k = 0; k < 100; k++) advanceWalker(b, 0.013);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
  });

  it('headingTile : la case visée pendant la marche, la sienne à l’arrêt', () => {
    const w = createWalker({ i: 3, j: 3 }, 2);
    expect(headingTile(w)).toEqual({ i: 3, j: 3 });
    setWalkerPath(w, [
      { i: 3, j: 3 },
      { i: 4, j: 3 },
    ]);
    advanceWalker(w, 0.1);
    expect(walkerTile(w)).toEqual({ i: 3, j: 3 });
    expect(headingTile(w)).toEqual({ i: 4, j: 3 });
  });
});

describe('vitesse de marche : 1,3 m/s = 2,6 cases/s', () => {
  it('constantes et vitesse par défaut', () => {
    expect(WALK_SPEED_MPS).toBe(1.3);
    expect(DEFAULT_WALK_SPEED).toBeCloseTo(2.6, 12);
    expect(createWalker({ i: 0, j: 0 }).speed).toBeCloseTo(2.6, 12);
  });

  it('en 1 s, la joueuse parcourt 2,6 cases soit 1,3 m', () => {
    const w = createWalker({ i: 0, j: 0 });
    setWalkerPath(
      w,
      Array.from({ length: 6 }, (_, i) => ({ i, j: 0 }))
    );
    advanceWalker(w, 1);
    expect(w.x - 0.5).toBeCloseTo(2.6, 12);
    expect(w.travelled * METERS_PER_TILE).toBeCloseTo(1.3, 12);
  });

  it('les bots marchent entre 1,0 et 1,5 m/s', () => {
    const world = new LibraryWorld(
      { w: 24, d: 24, wallHeight: 2.6, items: [] },
      {}
    );
    world.spawnBots(29);
    for (const a of world.avatars) {
      expect(a.walker.speed * METERS_PER_TILE).toBeGreaterThanOrEqual(1.0);
      expect(a.walker.speed * METERS_PER_TILE).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('LibraryWorld — identifiants d’avatars', () => {
  const empty = { w: 24, d: 24, wallHeight: 2.6, items: [] };

  it('sans manifeste : silhouettes (avatarId null) pour tout le monde', () => {
    const world = new LibraryWorld(empty, {});
    world.addAvatar('me', { i: 1, j: 1 }, 0);
    world.spawnBots(5);
    expect(world.avatars.every((a) => a.avatarId === null)).toBe(true);
  });

  it('manifeste chargé après coup : joueuse = 1er id, bots au hasard parmi les ids', () => {
    const world = new LibraryWorld(empty, {});
    world.addAvatar('me', { i: 1, j: 1 }, 0);
    world.spawnBots(20);
    world.setAvatarIds(['ada', 'grace']);
    expect(world.avatar('me')?.avatarId).toBe('ada');
    const bots = world.avatars.filter((a) => a.isBot);
    expect(
      bots.every((a) => a.avatarId === 'ada' || a.avatarId === 'grace')
    ).toBe(true);
    expect(new Set(bots.map((a) => a.avatarId)).size).toBe(2);
    // Nouveaux bots : tirés parmi les ids disponibles.
    world.clearBots();
    world.spawnBots(3);
    expect(
      world.avatars.filter((a) => a.isBot).every((a) => a.avatarId !== null)
    ).toBe(true);
  });
});

describe('LibraryWorld', () => {
  const room = {
    w: 6,
    d: 6,
    wallHeight: 2.5,
    items: [{ id: 's', key: 'shelf', gx: 2, gy: 2, r: 0 as const }],
  };
  const catalog = { shelf: { footprint: { w: 2, d: 1 }, height: 2 } };

  it('clic sur un meuble : refusé ; sur une case libre : l’avatar y arrive', () => {
    const world = new LibraryWorld(room, catalog);
    world.addAvatar('me', { i: 0, j: 0 }, 0);
    expect(world.walkTo('me', { i: 2, j: 2 })).toBe(false);
    expect(world.walkTo('me', { i: 9, j: 9 })).toBe(false);
    expect(world.walkTo('me', { i: 3, j: 4 })).toBe(true);
    expect(world.isActive()).toBe(true);
    for (let k = 0; k < 200 && world.isActive(); k++) world.update(1 / 60);
    expect(world.tileOf('me')).toEqual({ i: 3, j: 4 });
    expect(world.isActive()).toBe(false);
  });

  it('changer de cible en marchant repart de la case visée', () => {
    const world = new LibraryWorld(room, catalog);
    world.addAvatar('me', { i: 0, j: 0 }, 0);
    world.walkTo('me', { i: 5, j: 0 });
    world.update(0.2);
    world.walkTo('me', { i: 0, j: 5 });
    const w = world.avatar('me')?.walker;
    expect(w?.path[0]).toEqual({ i: 1, j: 0 });
    for (let k = 0; k < 600 && world.isActive(); k++) world.update(1 / 60);
    expect(world.tileOf('me')).toEqual({ i: 0, j: 5 });
  });

  it('bots : apparaissent sur des cases libres, flânent, disparaissent', () => {
    const world = new LibraryWorld({ ...room, w: 12, d: 12 }, catalog, 5);
    world.addAvatar('me', { i: 0, j: 0 }, 0);
    world.spawnBots(29);
    expect(world.avatars).toHaveLength(30);
    for (const a of world.avatars) {
      const t = walkerTile(a.walker);
      expect(world.grid.blocked[t.j * world.grid.w + t.i]).toBe(0);
    }
    let moved = false;
    for (let k = 0; k < 120; k++) moved = world.update(1 / 30) || moved;
    expect(moved).toBe(true);
    expect(world.isActive()).toBe(true);
    world.clearBots();
    expect(world.avatars.map((a) => a.id)).toEqual(['me']);
  });
});

describe('FrameLoop — rendu à la demande', () => {
  function fakeRaf() {
    let queue: Array<(now: number) => void> = [];
    let now = 0;
    return {
      raf: (cb: (now: number) => void) => {
        queue.push(cb);
        return queue.length;
      },
      caf: () => {
        queue = [];
      },
      /** Exécute les rappels en attente, 16 ms plus tard. */
      step() {
        now += 16;
        const q = queue;
        queue = [];
        for (const cb of q) cb(now);
        return q.length;
      },
    };
  }

  it('une demande = une image ; s’arrête au repos ; enchaîne tant que ça bouge', () => {
    const r = fakeRaf();
    let frames = 0;
    let moving = 0;
    const loop = new FrameLoop(
      () => {
        frames++;
        return { keepGoing: moving-- > 0, frameMs: 1 };
      },
      () => {},
      r.raf,
      r.caf
    );
    loop.request();
    loop.request(); // déjà programmée : pas de doublon
    expect(r.step()).toBe(1);
    expect(r.step()).toBe(0); // au repos
    expect(frames).toBe(1);
    moving = 3;
    loop.request();
    while (r.step()) {}
    expect(frames).toBe(5);
    loop.stop();
    loop.request();
    expect(r.step()).toBe(0);
  });

  it('mesure les FPS pendant l’animation et signale le retour au repos', () => {
    const r = fakeRaf();
    let left = 130;
    const stats: Array<number | null> = [];
    const loop = new FrameLoop(
      () => ({ keepGoing: left-- > 0, frameMs: 2 }),
      (s) => stats.push(s.fps),
      r.raf,
      r.caf
    );
    loop.request();
    while (r.step()) {}
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats[0]).toBeCloseTo(62.5, 0);
    expect(stats[stats.length - 1]).toBeNull();
  });
});
