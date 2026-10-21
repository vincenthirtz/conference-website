// Women's Library, lot 15 — s'asseoir, s'allonger, se servir d'un meuble,
// sans DOM ni réseau :
//   * les PROFILS (une ligne par famille, les variantes suivent leur base,
//     sinon la catégorie) et les PLACES d'un meuble dans les 4 rotations :
//     position du bassin, direction (le regard, les pieds), dessin devant ou
//     derrière le meuble ;
//   * la CASE D'ACCÈS (devant la place, au côté d'un lit, sinon la plus
//     proche qui touche le meuble) et celle d'un meuble dont on se sert ;
//   * les PANNEAUX tournés vers la caméra (tête de lit, dossier) ;
//   * l'OCCUPATION : une place prise est sautée, tout pris → on marche à côté ;
//   * le MONDE : arriver assise, se relever en partant, un meuble déplacé
//     relève, les autres joueuses (présence, `move`, conflit, catalogue).

import { describe, expect, it } from 'vitest';
import {
  facesAway,
  faceItem,
  frontPanels,
  furnitureSpots,
  interactionOf,
  localDirection,
  localToGrid,
  profileOf,
  spotAccess,
  touchesItem,
  serviceAccess,
} from '../../features/player/library/engine/interactions';
import {
  isWalking,
  walkerTile,
} from '../../features/player/library/engine/motion';
import { buildWalkGrid } from '../../features/player/library/engine/room';
import {
  planFurniture,
  postureValid,
  settle,
} from '../../features/player/library/engine/postures';
import type { RemoteAvatarInput } from '../../features/player/library/engine/remotes';
import type {
  FurnitureCatalog,
  RoomItem,
  RoomModel,
  Rotation,
} from '../../features/player/library/engine/room';
import {
  stanceBox,
  stanceTopM,
} from '../../features/player/library/engine/stance';
import { LibraryWorld } from '../../features/player/library/engine/world';

const CATALOG: FurnitureCatalog = {
  sofa: { footprint: { w: 3, d: 2 }, height: 0.8 },
  sofa_blue: { footprint: { w: 3, d: 2 }, height: 0.8 },
  armchair: { footprint: { w: 2, d: 2 }, height: 1.07 },
  bean_bag: { footprint: { w: 2, d: 2 }, height: 0.36 },
  stool: { footprint: { w: 1, d: 1 }, height: 0.44 },
  bed: { footprint: { w: 3, d: 4 }, height: 1.53 },
  daybed: { footprint: { w: 4, d: 2 }, height: 1.13 },
  bookshelf_filled: { footprint: { w: 3, d: 1 }, height: 2.06 },
  mirror: { footprint: { w: 1, d: 1 }, height: 1.84, layer: 'wall' },
  plant_tall: { footprint: { w: 1, d: 1 }, height: 1.22 },
  coffee_table: { footprint: { w: 3, d: 2 }, height: 0.52 },
  crate: { footprint: { w: 1, d: 1 }, height: 1 },
};

const at = (key: string, gx: number, gy: number, r: Rotation, id = key) =>
  ({ id, key, gx, gy, r }) as RoomItem;

const room = (items: RoomItem[]): RoomModel => ({
  w: 14,
  d: 12,
  wallHeight: 2.6,
  items,
});
const gridOf = (items: RoomItem[]) => buildWalkGrid(room(items), CATALOG);

const round = (n: number) => Math.round(n * 1000) / 1000;
const spotsAt = (item: RoomItem) =>
  furnitureSpots(item, CATALOG).map((s) => ({
    x: round(s.x),
    y: round(s.y),
    dir: s.dir,
    behind: s.behind,
  }));

describe('interactions — les profils', () => {
  it('une famille a son profil, ses variantes le suivent, sinon la catégorie', () => {
    expect(profileOf('sofa', { w: 3, d: 2 })).toMatchObject({
      kind: 'sit',
      places: [0.85, 2.15],
    });
    expect(profileOf('sofa_blue', { w: 3, d: 2 })).toEqual(
      profileOf('sofa', { w: 3, d: 2 })
    );
    expect(profileOf('bean_bag', { w: 2, d: 2 })).toMatchObject({ low: true });
    expect(profileOf('bed', { w: 3, d: 4 })).toMatchObject({ kind: 'lie' });
    // Une plante sans ligne à elle : la catégorie (arroser).
    expect(profileOf('cactus', { w: 1, d: 1 })).toEqual({
      kind: 'use',
      activity: 'water',
    });
    expect(profileOf('coffee_table', { w: 3, d: 2 })).toBeNull();
    expect(profileOf('nope', { w: 1, d: 1 })).toBeNull();
  });

  it('ce que propose un meuble posé', () => {
    expect(interactionOf(at('sofa', 2, 2, 0), CATALOG)).toBe('sit');
    expect(interactionOf(at('bed', 2, 2, 0), CATALOG)).toBe('lie');
    expect(interactionOf(at('bookshelf_filled', 2, 0, 0), CATALOG)).toBe(
      'read'
    );
    expect(interactionOf(at('mirror', 2, 0, 0), CATALOG)).toBe('dress');
    expect(interactionOf(at('coffee_table', 2, 2, 0), CATALOG)).toBeNull();
  });
});

describe('interactions — géométrie des rotations', () => {
  it('un point local tourne comme le meuble ; l’avant regarde 5, 3, 1, 7', () => {
    const fp = { w: 3, d: 2 };
    const p = (r: Rotation) => localToGrid({ gx: 2, gy: 2, r }, fp, 0.5, 2);
    expect(p(0)).toEqual({ x: 2.5, y: 4 });
    expect(p(1)).toEqual({ x: 4, y: 4.5 });
    expect(p(2)).toEqual({ x: 4.5, y: 2 });
    expect(p(3)).toEqual({ x: 2, y: 2.5 });
    expect(
      [0, 1, 2, 3].map((r) => localDirection(r as Rotation, 0, 1))
    ).toEqual([5, 3, 1, 7]);
    expect([7, 0, 1].every((d) => facesAway(d as 7 | 0 | 1))).toBe(true);
    expect(facesAway(5)).toBe(false);
  });

  it('les deux places d’un canapé, dans les 4 rotations', () => {
    expect(spotsAt(at('sofa', 2, 2, 0))).toEqual([
      { x: 2.85, y: 2.8, dir: 5, behind: false },
      { x: 4.15, y: 2.8, dir: 5, behind: false },
    ]);
    expect(spotsAt(at('sofa', 2, 2, 1))).toEqual([
      { x: 2.8, y: 4.15, dir: 3, behind: false },
      { x: 2.8, y: 2.85, dir: 3, behind: false },
    ]);
    // Dos à la caméra : dessinées AVANT le canapé (le dossier les cache).
    expect(spotsAt(at('sofa', 2, 2, 2))).toEqual([
      { x: 4.15, y: 3.2, dir: 1, behind: true },
      { x: 2.85, y: 3.2, dir: 1, behind: true },
    ]);
    expect(spotsAt(at('sofa', 2, 2, 3))).toEqual([
      { x: 3.2, y: 2.85, dir: 7, behind: true },
      { x: 3.2, y: 4.15, dir: 7, behind: true },
    ]);
  });

  it('un siège sans dossier n’est jamais dessiné derrière ; assise basse sur un pouf', () => {
    const stool = furnitureSpots(at('stool', 2, 2, 2), CATALOG);
    expect(stool).toMatchObject([{ x: 2.5, y: 2.5, dir: 1, behind: false }]);
    expect(furnitureSpots(at('bean_bag', 2, 2, 0), CATALOG)[0]).toMatchObject({
      pose: 'sit_low',
      surfaceM: 0.25,
    });
  });

  it('un lit : deux dormeuses, les pieds vers l’avant ; une banquette : la tête au bout +u', () => {
    expect(furnitureSpots(at('bed', 2, 2, 0), CATALOG)).toMatchObject([
      { pose: 'lie', x: 2.85, y: 3.8, dir: 5, behind: false },
      { pose: 'lie', x: 4.15, y: 3.8, dir: 5, behind: false },
    ]);
    expect(furnitureSpots(at('bed', 2, 2, 2), CATALOG)[0]).toMatchObject({
      dir: 1,
      behind: false,
    });
    const daybed = (r: Rotation) =>
      furnitureSpots(at('daybed', 2, 2, r), CATALOG);
    expect(daybed(0)[0]).toMatchObject({ x: 4.1, y: 3.1, dir: 7 });
    expect([0, 1, 2, 3].map((r) => daybed(r as Rotation)[0].dir)).toEqual([
      7, 5, 3, 1,
    ]);
  });

  it('un meuble sans place n’en a pas', () => {
    expect(furnitureSpots(at('bookshelf_filled', 2, 0, 0), CATALOG)).toEqual(
      []
    );
    expect(furnitureSpots(at('coffee_table', 2, 2, 0), CATALOG)).toEqual([]);
  });
});

describe('interactions — les cases d’accès', () => {
  it('devant chaque place, dans les 4 rotations', () => {
    const access = (r: Rotation, k: number) => {
      const item = at('sofa', 2, 2, r);
      return spotAccess(item, CATALOG, gridOf([item]), k);
    };
    expect([access(0, 0), access(0, 1)]).toEqual([
      { i: 2, j: 4 },
      { i: 4, j: 4 },
    ]);
    expect([access(1, 0), access(1, 1)]).toEqual([
      { i: 4, j: 4 },
      { i: 4, j: 2 },
    ]);
    expect(access(2, 0)).toEqual({ i: 4, j: 1 });
    expect(access(3, 0)).toEqual({ i: 1, j: 2 });
  });

  it('devant bloqué : la case libre qui touche le meuble, la plus proche ; tout bloqué : null', () => {
    const sofa = at('sofa', 2, 2, 0);
    const crate = at('crate', 2, 4, 0, 'crate');
    const t = spotAccess(sofa, CATALOG, gridOf([sofa, crate]), 0);
    expect(t).not.toBeNull();
    expect(t).not.toEqual({ i: 2, j: 4 });
    expect(touchesItem(sofa, CATALOG, t as { i: number; j: number })).toBe(
      true
    );
    // Un tabouret dans un coin, cerné : aucune case.
    const stool = at('stool', 0, 0, 0);
    const walls = [
      at('crate', 1, 0, 0, 'c1'),
      at('crate', 0, 1, 0, 'c2'),
      at('crate', 1, 1, 0, 'c3'),
    ];
    expect(spotAccess(stool, CATALOG, gridOf([stool, ...walls]), 0)).toBeNull();
    expect(spotAccess(stool, CATALOG, gridOf([stool]), 5)).toBeNull();
  });

  it('un lit : au côté de chaque dormeuse', () => {
    const bed = at('bed', 2, 2, 0);
    const grid = gridOf([bed]);
    expect(spotAccess(bed, CATALOG, grid, 0)).toEqual({ i: 1, j: 3 });
    expect(spotAccess(bed, CATALOG, grid, 1)).toEqual({ i: 5, j: 3 });
  });

  it('se servir : devant le milieu, face au meuble (mural compris)', () => {
    const shelf = at('bookshelf_filled', 5, 0, 0);
    const t = serviceAccess(shelf, CATALOG, gridOf([shelf]));
    expect(t).toEqual({ i: 6, j: 1 });
    expect(faceItem(shelf, CATALOG, { i: 6, j: 1 })).toBe(1);
    const mirror = at('mirror', 0, 3, 1);
    expect(serviceAccess(mirror, CATALOG, gridOf([mirror]))).toEqual({
      i: 1,
      j: 3,
    });
    expect(faceItem(mirror, CATALOG, { i: 1, j: 3 })).toBe(7);
    // Une case déjà prise est évitée tant qu'il y en a une autre.
    const avoid = (x: { i: number; j: number }) => x.i === 6 && x.j === 1;
    expect(serviceAccess(shelf, CATALOG, gridOf([shelf]), avoid)).not.toEqual({
      i: 6,
      j: 1,
    });
  });
});

describe('interactions — les panneaux devant les dormeuses', () => {
  it('seuls ceux tournés vers la caméra (face +x ou +y)', () => {
    // r0 : le pied du lit (avant, +y) ; la tête est au fond.
    expect(frontPanels(at('bed', 1, 1, 0), CATALOG)).toEqual([
      [
        [1, 5, 0],
        [4, 5, 0],
        [4, 5, 0.7],
        [1, 5, 0.7],
      ],
    ]);
    // r2 : la tête de lit passe devant (face +y), le pied est au fond.
    expect(frontPanels(at('bed', 1, 1, 2), CATALOG)[0][0]).toEqual([4, 5, 0]);
    // Une banquette : son dossier seulement de dos (r2, r3), en retrait.
    expect(frontPanels(at('daybed', 1, 1, 0), CATALOG)).toEqual([]);
    const r2 = frontPanels(at('daybed', 1, 1, 2), CATALOG);
    expect(r2).toHaveLength(1);
    expect(r2[0][0][1]).toBeCloseTo(3 - 0.35, 9);
    expect(frontPanels(at('sofa', 1, 1, 2), CATALOG)).toEqual([]);
  });
});

/* ------------------------------------------------------------ le monde --- */

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

function world(items: RoomItem[], catalog = CATALOG) {
  const w = new LibraryWorld(room(items), catalog);
  w.addAvatar('me', { i: 8, j: 8 }, 0);
  return w;
}

function runUntilStill(w: LibraryWorld, max = 400) {
  for (let k = 0; k < max && w.isActive(); k++) w.update(0.05);
}

const remote = (over: Partial<RemoteAvatarInput> = {}): RemoteAvatarInput => ({
  id: IRIS,
  nickname: 'Iris',
  avatarId: 'a05',
  tile: { i: 2, j: 4 },
  dir: 4,
  target: null,
  bubble: null,
  ...over,
});

describe('postures — la joueuse', () => {
  it('un appui sur un canapé : elle marche à la case d’accès, s’assoit en arrivant', () => {
    const sofa = at('sofa', 2, 2, 0);
    const w = world([sofa]);
    const plan = planFurniture(w, 'me', sofa, 'sit');
    expect(plan).toEqual({
      goal: { i: 2, j: 4 },
      intent: { kind: 'seat', itemId: 'sofa', spot: 0 },
    });
    expect(w.interact('me', plan as NonNullable<typeof plan>)).toBe(true);
    const me = w.avatar('me')!;
    expect(isWalking(me.walker)).toBe(true);
    expect(me.posture).toBeNull();
    runUntilStill(w);
    expect(walkerTile(me.walker)).toEqual({ i: 2, j: 4 });
    expect(me.posture).toMatchObject({ kind: 'seat', spot: 0, pose: 'sit' });
    expect(me.walker.dir).toBe(5);
    expect(w.takeArrivals()).toEqual(['me']);
    // Assise : dessinée sur la place, la tête plus bas que debout.
    const box = stanceBox(me);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(2.85, 9);
    expect(stanceTopM(me)).toBeLessThan(1.4);
  });

  it('le point visé choisit la place ; une place prise est sautée ; tout pris → à côté, sans intention', () => {
    const sofa = at('sofa', 2, 2, 0);
    const w = world([sofa]);
    w.syncRemoteAvatars(
      [
        remote({
          tile: { i: 4, j: 4 },
          rest: { kind: 'seat', itemId: 'sofa', spot: 1 },
        }),
      ],
      0
    );
    expect(w.avatar(IRIS)?.posture).toMatchObject({ spot: 1 });
    // Visée sur la place 1 (prise) : la place 0.
    const plan = planFurniture(w, 'me', sofa, 'sit', { x: 1e6, y: 0 });
    expect(plan?.intent).toEqual({ kind: 'seat', itemId: 'sofa', spot: 0 });
    w.syncRemoteAvatars(
      [
        remote({
          tile: { i: 4, j: 4 },
          rest: { kind: 'seat', itemId: 'sofa', spot: 1 },
        }),
        remote({
          id: NOVA,
          tile: { i: 2, j: 4 },
          rest: { kind: 'seat', itemId: 'sofa', spot: 0 },
        }),
      ],
      0
    );
    const full = planFurniture(w, 'me', sofa, 'sit');
    expect(full?.intent).toBeNull();
    expect(full?.goal).toBeDefined();
  });

  it('repartir relève ; « Se lever » relève sur place ; un meuble déplacé ou retiré relève', () => {
    const sofa = at('sofa', 2, 2, 0);
    const w = world([sofa]);
    const me = w.avatar('me')!;
    const sit = () => {
      w.interact('me', planFurniture(w, 'me', sofa, 'sit')!);
      runUntilStill(w);
      expect(me.posture).not.toBeNull();
    };
    sit();
    expect(w.walkTo('me', { i: 8, j: 8 })).toBe(true);
    expect(me.posture).toBeNull();
    runUntilStill(w);
    sit();
    expect(w.standUp('me')).toBe(true);
    expect(me.posture).toBeNull();
    expect(w.standUp('me')).toBe(false);
    sit();
    w.setRoomItems([at('sofa', 2, 2, 1)]);
    expect(me.posture).toBeNull();
    sit();
    expect(postureValid(w, me.posture!)).toBe(true);
    w.setRoomItems([]);
    expect(me.posture).toBeNull();
  });

  it('déjà sur la case d’accès : assise tout de suite ; un meuble dont on se sert : face à lui', () => {
    const shelf = at('bookshelf_filled', 5, 0, 0);
    const w = world([shelf]);
    w.placeAvatar('me', { i: 6, j: 1 });
    const plan = planFurniture(w, 'me', shelf, 'read');
    expect(plan).toEqual({
      goal: { i: 6, j: 1 },
      intent: { kind: 'use', itemId: 'bookshelf_filled' },
    });
    w.interact('me', plan!);
    const me = w.avatar('me')!;
    expect(me.posture).toMatchObject({ kind: 'use', activity: 'read' });
    expect(me.walker.dir).toBe(1);
  });

  it('settle : trop loin du meuble, place inconnue ou meuble inconnu → debout', () => {
    const sofa = at('sofa', 2, 2, 0);
    const w = world([sofa]);
    const me = w.avatar('me')!;
    expect(settle(w, me, { kind: 'seat', itemId: 'sofa', spot: 0 })).toBeNull();
    w.placeAvatar('me', { i: 2, j: 4 });
    expect(settle(w, me, { kind: 'seat', itemId: 'sofa', spot: 9 })).toBeNull();
    expect(settle(w, me, { kind: 'seat', itemId: 'gone', spot: 0 })).toBeNull();
    expect(settle(w, me, { kind: 'use', itemId: 'sofa' })).toBeNull();
    expect(
      settle(w, me, { kind: 'seat', itemId: 'sofa', spot: 0 })
    ).toMatchObject({ kind: 'seat', spot: 0 });
  });
});

describe('postures — les autres joueuses', () => {
  const sofa = at('sofa', 2, 2, 0);

  it('une présence assise : posée directement sur sa place', () => {
    const w = world([sofa]);
    w.syncRemoteAvatars(
      [remote({ rest: { kind: 'seat', itemId: 'sofa', spot: 0 } })],
      0
    );
    const iris = w.avatar(IRIS)!;
    expect(isWalking(iris.walker)).toBe(false);
    expect(iris.posture).toMatchObject({ kind: 'seat', itemId: 'sofa' });
  });

  it('un `move` vers un meuble : elle y marche, puis s’assoit en arrivant', () => {
    const w = world([sofa]);
    w.syncRemoteAvatars([remote({ tile: { i: 8, j: 2 } })], 0);
    w.syncRemoteAvatars(
      [
        remote({
          tile: { i: 8, j: 2 },
          target: {
            tile: { i: 4, j: 4 },
            receivedAt: 10,
            rest: { kind: 'seat', itemId: 'sofa', spot: 1 },
          },
        }),
      ],
      10
    );
    const iris = w.avatar(IRIS)!;
    expect(isWalking(iris.walker)).toBe(true);
    expect(iris.posture).toBeNull();
    runUntilStill(w);
    expect(iris.posture).toMatchObject({ spot: 1 });
  });

  it('deux sur la même place : la première la garde, l’autre reste debout à sa case', () => {
    const w = world([sofa]);
    const seat = { kind: 'seat' as const, itemId: 'sofa', spot: 0 };
    w.syncRemoteAvatars(
      [
        remote({ rest: seat }),
        remote({ id: NOVA, tile: { i: 3, j: 4 }, rest: seat }),
      ],
      0
    );
    expect(w.avatar(IRIS)?.posture).not.toBeNull();
    expect(w.avatar(NOVA)?.posture).toBeNull();
    expect(walkerTile(w.avatar(NOVA)!.walker)).toEqual({ i: 3, j: 4 });
  });

  it('meuble inconnu : debout ; une présence sans posture la relève (après le délai de grâce)', () => {
    const w = world([sofa]);
    w.syncRemoteAvatars(
      [remote({ rest: { kind: 'seat', itemId: 'nope', spot: 0 } })],
      0
    );
    expect(w.avatar(IRIS)?.posture).toBeNull();
    w.syncRemoteAvatars(
      [remote({ rest: { kind: 'seat', itemId: 'sofa', spot: 0 } })],
      0
    );
    expect(w.avatar(IRIS)?.posture).not.toBeNull();
    w.syncRemoteAvatars([remote()], 0);
    expect(w.avatar(IRIS)?.posture).toBeNull();
  });

  it('la joueuse assise garde sa place face à une autre qui la réclame', () => {
    const w = world([sofa]);
    w.interact('me', planFurniture(w, 'me', sofa, 'sit')!);
    runUntilStill(w);
    w.syncRemoteAvatars(
      [remote({ rest: { kind: 'seat', itemId: 'sofa', spot: 0 } })],
      0
    );
    expect(w.avatar('me')?.posture).not.toBeNull();
    expect(w.avatar(IRIS)?.posture).toBeNull();
  });

  it('le manifeste arrive après la présence : chacune se réinstalle (empreintes justes)', () => {
    // Avant le manifeste, le canapé est inconnu (1 × 1) : trop loin, debout.
    const w = world([sofa], {});
    w.syncRemoteAvatars(
      [
        remote({
          tile: { i: 4, j: 4 },
          rest: { kind: 'seat', itemId: 'sofa', spot: 1 },
        }),
      ],
      0
    );
    expect(w.avatar(IRIS)?.posture).toBeNull();
    w.setCatalog(CATALOG);
    expect(w.avatar(IRIS)?.posture).toMatchObject({ spot: 1 });
    expect(w.avatar(IRIS)?.posture).toMatchObject({ x: 4.15, y: 2.8 });
  });
});
