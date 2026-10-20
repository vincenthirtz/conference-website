// Women's Library, lot 5 phase B — les AUTRES joueuses dans le moteur, sans
// DOM ni réseau :
//   * `planRemoteStep` : une case visée plus récente fait marcher, une
//     présence en retard est ignorée le temps de grâce, une présence lointaine
//     pose l'avatar, une proche le fait marcher ;
//   * `LibraryWorld.syncRemoteAvatars` : apparaît sur sa présence, disparaît
//     tout de suite, marche par A* depuis la case où elle va, est posée si la
//     case est inaccessible, ne touche jamais la joueuse ni les bots ;
//   * les bulles (reçues et la mienne) et leur échéance ;
//   * viser une joueuse par son image (la plus en avant, jamais soi) ;
//   * l'arrivée de la joueuse, signalée une fois.

import { describe, expect, it } from 'vitest';
import {
  isWalking,
  walkerTile,
} from '../../features/player/library/engine/motion';
import { gridToScreen } from '../../features/player/library/engine/projection';
import {
  NEAR_TILES,
  PRESENCE_GRACE_MS,
  planRemoteStep,
  type RemoteAvatarInput,
} from '../../features/player/library/engine/remotes';
import type {
  FurnitureCatalog,
  RoomModel,
} from '../../features/player/library/engine/room';
import { LibraryWorld } from '../../features/player/library/engine/world';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

const CATALOG: FurnitureCatalog = {
  shelf: { footprint: { w: 3, d: 1 }, height: 2 },
  table: { footprint: { w: 2, d: 2 }, height: 0.75 },
};
/** Un rayonnage couvre (5,5), (6,5), (7,5). */
const ROOM: RoomModel = {
  w: 14,
  d: 12,
  wallHeight: 2.6,
  items: [{ id: 'shelf', key: 'shelf', gx: 5, gy: 5, r: 0 }],
};

function remote(over: Partial<RemoteAvatarInput> = {}): RemoteAvatarInput {
  return {
    id: IRIS,
    nickname: 'Iris',
    avatarId: 'a05',
    tile: { i: 2, j: 2 },
    dir: 4,
    target: null,
    bubble: null,
    ...over,
  };
}

function makeWorld(room: RoomModel = ROOM): LibraryWorld {
  const w = new LibraryWorld(room, CATALOG);
  w.addAvatar('me', { i: 10, j: 10 }, 0);
  return w;
}

/** Avance la simulation de `seconds` (images de 1/60 s). */
function run(w: LibraryWorld, seconds: number) {
  for (let k = 0; k < Math.round(seconds * 60); k++) w.update(1 / 60);
}

const tileOf = (w: LibraryWorld, id: string) => {
  const a = w.avatar(id);
  return a ? walkerTile(a.walker) : null;
};

describe('planRemoteStep — case visée contre présence', () => {
  const at = (i: number, j: number) => ({ i, j });

  it('une case visée plus récente fait marcher ; la même (ou plus ancienne) non', () => {
    const target = { tile: at(5, 9), receivedAt: 1000 };
    expect(
      planRemoteStep({
        current: at(2, 2),
        walking: false,
        lastTargetAt: 900,
        input: { tile: at(2, 2), target },
        now: 1000,
      })
    ).toEqual({ step: { kind: 'walk', tile: at(5, 9) }, lastTargetAt: 1000 });
    expect(
      planRemoteStep({
        current: at(5, 9),
        walking: false,
        lastTargetAt: 1000,
        input: { tile: at(5, 9), target },
        now: 1200,
      }).step
    ).toEqual({ kind: 'none' });
  });

  it('en marche : la présence ne la détourne pas', () => {
    expect(
      planRemoteStep({
        current: at(3, 3),
        walking: true,
        lastTargetAt: 1000,
        input: { tile: at(9, 9), target: { tile: at(5, 9), receivedAt: 1000 } },
        now: 9000,
      }).step
    ).toEqual({ kind: 'none' });
  });

  it('une présence qui contredit une case visée récente attend PRESENCE_GRACE_MS', () => {
    const base = {
      current: at(5, 9),
      walking: false,
      lastTargetAt: 1000,
      input: { tile: at(4, 9), target: { tile: at(5, 9), receivedAt: 1000 } },
    };
    expect(
      planRemoteStep({ ...base, now: 1000 + PRESENCE_GRACE_MS - 1 }).step
    ).toEqual({ kind: 'none' });
    expect(
      planRemoteStep({ ...base, now: 1000 + PRESENCE_GRACE_MS }).step
    ).toEqual({ kind: 'walk', tile: at(4, 9) });
  });

  it('sans case visée : à pied jusqu’à NEAR_TILES, posée au-delà', () => {
    const plan = (i: number) =>
      planRemoteStep({
        current: at(0, 0),
        walking: false,
        lastTargetAt: null,
        input: { tile: at(i, 0), target: null },
        now: 0,
      }).step.kind;
    expect(plan(NEAR_TILES)).toBe('walk');
    expect(plan(NEAR_TILES + 1)).toBe('place');
    expect(plan(0)).toBe('none');
  });
});

describe('LibraryWorld.syncRemoteAvatars', () => {
  it('une autre joueuse apparaît sur sa case de présence, distincte de la joueuse et des bots', () => {
    const w = makeWorld();
    w.spawnBots(2);
    w.syncRemoteAvatars([remote({ dir: 2 })], 0);
    const iris = w.avatar(IRIS);
    expect(iris?.kind).toBe('remote');
    expect(iris?.label).toBe('Iris');
    expect(iris?.walker.dir).toBe(2);
    expect(tileOf(w, IRIS)).toEqual({ i: 2, j: 2 });
    expect(w.avatar('me')?.kind).toBe('player');
    expect(w.avatars.filter((a) => a.kind === 'bot')).toHaveLength(2);
  });

  it('partie : retirée tout de suite, sans toucher la joueuse ni les bots', () => {
    const w = makeWorld();
    w.spawnBots(1);
    w.syncRemoteAvatars([remote(), remote({ id: NOVA, nickname: 'Nova' })], 0);
    w.syncRemoteAvatars([remote({ id: NOVA, nickname: 'Nova' })], 10);
    expect(w.avatar(IRIS)).toBeUndefined();
    expect(w.avatar(NOVA)?.kind).toBe('remote');
    expect(w.avatars.map((a) => a.kind).sort()).toEqual([
      'bot',
      'player',
      'remote',
    ]);
  });

  it('jamais la joueuse, même à identifiant égal ; hors de la salle : ignorée', () => {
    const w = makeWorld();
    w.syncRemoteAvatars(
      [
        remote({ id: 'me', tile: { i: 0, j: 0 } }),
        remote({ tile: { i: 20, j: 3 } }),
      ],
      0
    );
    expect(w.avatar('me')?.kind).toBe('player');
    expect(w.avatar('me')?.label).toBeNull();
    expect(tileOf(w, 'me')).toEqual({ i: 10, j: 10 });
    expect(w.avatar(IRIS)).toBeUndefined();
  });

  it('une case visée plus récente : elle y marche (A*) ; une plus ancienne est ignorée', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote()], 0);
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 6, j: 8 }, receivedAt: 1000 } })],
      1000
    );
    const iris = w.avatar(IRIS);
    expect(iris && isWalking(iris.walker)).toBe(true);
    expect(iris?.walker.path.at(-1)).toEqual({ i: 6, j: 8 });
    // La boucle doit tourner : quelqu'un marche.
    expect(w.isActive()).toBe(true);
    run(w, 4);
    expect(tileOf(w, IRIS)).toEqual({ i: 6, j: 8 });
    // Un `move` plus ancien (réordonné) ne la fait pas repartir.
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 12, j: 2 }, receivedAt: 900 } })],
      5000
    );
    expect(isWalking(w.avatar(IRIS)!.walker)).toBe(false);
  });

  it('en marche, une nouvelle case visée repart de la case où elle va (pas de demi-tour)', () => {
    const w = makeWorld();
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 2, j: 9 }, receivedAt: 1000 } })],
      1000
    );
    w.update(0.1);
    const heading = { ...w.avatar(IRIS)!.walker.path[0] };
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 9, j: 2 }, receivedAt: 1200 } })],
      1200
    );
    const path = w.avatar(IRIS)!.walker.path;
    expect(path[0]).toEqual(heading);
    expect(path.at(-1)).toEqual({ i: 9, j: 2 });
    run(w, 6);
    expect(tileOf(w, IRIS)).toEqual({ i: 9, j: 2 });
  });

  it('une case visée inaccessible (sous un meuble) : posée directement', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote()], 0);
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 6, j: 5 }, receivedAt: 1000 } })],
      1000
    );
    expect(isWalking(w.avatar(IRIS)!.walker)).toBe(false);
    expect(tileOf(w, IRIS)).toEqual({ i: 6, j: 5 });
  });

  it('sans case visée : une présence lointaine la pose (reconnexion), une proche la fait marcher', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote()], 0);
    w.syncRemoteAvatars([remote({ tile: { i: 12, j: 10 } })], 100);
    expect(isWalking(w.avatar(IRIS)!.walker)).toBe(false);
    expect(tileOf(w, IRIS)).toEqual({ i: 12, j: 10 });
    w.syncRemoteAvatars([remote({ tile: { i: 12, j: 8 } })], 200);
    expect(isWalking(w.avatar(IRIS)!.walker)).toBe(true);
    run(w, 2);
    expect(tileOf(w, IRIS)).toEqual({ i: 12, j: 8 });
  });

  it('une présence en retard après une case visée est ignorée, puis suivie après le délai de grâce', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote()], 0);
    const target = { tile: { i: 2, j: 4 }, receivedAt: 1000 };
    w.syncRemoteAvatars([remote({ target })], 1000);
    run(w, 2);
    expect(tileOf(w, IRIS)).toEqual({ i: 2, j: 4 });
    // La présence de l'arrivée PRÉCÉDENTE arrive après le `move`.
    const stale = remote({ tile: { i: 3, j: 3 }, target });
    w.syncRemoteAvatars([stale], 1500);
    expect(isWalking(w.avatar(IRIS)!.walker)).toBe(false);
    expect(tileOf(w, IRIS)).toEqual({ i: 2, j: 4 });
    // Toujours la même des secondes plus tard : c'est elle qui fait foi.
    w.syncRemoteAvatars([stale], 1000 + PRESENCE_GRACE_MS);
    run(w, 2);
    expect(tileOf(w, IRIS)).toEqual({ i: 3, j: 3 });
  });

  it('un avatar inconnu du manifeste prend le premier, comme la joueuse', () => {
    const w = makeWorld();
    w.setAvatarIds(['a01', 'a02']);
    w.syncRemoteAvatars([remote({ avatarId: 'a02' })], 0);
    expect(w.avatar(IRIS)?.avatarId).toBe('a02');
    w.syncRemoteAvatars([remote({ avatarId: 'zz' })], 10);
    expect(w.avatar(IRIS)?.avatarId).toBe('a01');
  });
});

describe('les bulles', () => {
  const wave = { key: 'k1', glyph: '👋', text: 'Saluer' };

  it('une bulle reçue s’efface à shownAt + bubbleMs ; une échue n’est pas montrée', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote({ bubble: { ...wave, shownAt: 1000 } })], 1000);
    expect(w.avatar(IRIS)?.bubble).toMatchObject({
      text: 'Saluer',
      expiresAt: 5000,
    });
    expect(w.nextBubbleExpiry()).toBe(5000);
    expect(w.pruneBubbles(4999)).toBe(false);
    expect(w.pruneBubbles(5000)).toBe(true);
    expect(w.avatar(IRIS)?.bubble).toBeNull();
    expect(w.nextBubbleExpiry()).toBeNull();

    w.syncRemoteAvatars(
      [remote({ bubble: { ...wave, key: 'k0', shownAt: 0 } })],
      6000
    );
    expect(w.avatar(IRIS)?.bubble).toBeNull();
  });

  it('la même bulle n’est pas relancée à chaque synchronisation', () => {
    const w = makeWorld();
    w.syncRemoteAvatars([remote({ bubble: { ...wave, shownAt: 1000 } })], 1000);
    const first = w.avatar(IRIS)?.bubble;
    w.syncRemoteAvatars([remote({ bubble: { ...wave, shownAt: 1000 } })], 3000);
    expect(w.avatar(IRIS)?.bubble).toBe(first);
  });

  it('ma bulle (mon signe parti) dure bubbleMs ; null l’efface', () => {
    const w = makeWorld();
    w.bubbleMs = 1500;
    w.showBubble('me', wave, 2000);
    expect(w.avatar('me')?.bubble).toMatchObject({
      glyph: '👋',
      expiresAt: 3500,
    });
    expect(w.pruneBubbles(3499)).toBe(false);
    expect(w.pruneBubbles(3500)).toBe(true);
    w.showBubble('me', wave, 4000);
    w.showBubble('me', null, 4100);
    expect(w.avatar('me')?.bubble).toBeNull();
  });

  it('le repère « discrète » se pose et s’efface', () => {
    const w = makeWorld();
    w.setMarker('me', 'discrète');
    expect(w.avatar('me')?.marker).toBe('discrète');
    w.setMarker('me', null);
    expect(w.avatar('me')?.marker).toBeNull();
  });
});

describe('viser une autre joueuse par son image', () => {
  const OPEN: RoomModel = { w: 14, d: 12, wallHeight: 2.6, items: [] };

  it('la plus en avant gagne ; la joueuse n’est pas visée (sauf si demandée)', () => {
    const w = new LibraryWorld(OPEN, CATALOG);
    w.addAvatar('me', { i: 8, j: 8 }, 0);
    w.syncRemoteAvatars(
      [
        remote({ tile: { i: 4, j: 4 } }),
        remote({ id: NOVA, nickname: 'Nova', tile: { i: 5, j: 5 } }),
      ],
      0
    );
    // Le buste de Nova recouvre aussi la tête d'Iris, derrière elle.
    const torso = gridToScreen(5.5, 5.5, 1.0);
    expect(w.avatarAtScreen(torso.x, torso.y)?.id).toBe(NOVA);
    const head = gridToScreen(4.5, 4.5, 1.6);
    expect(w.avatarAtScreen(head.x, head.y)?.id).toBe(IRIS);
    const me = gridToScreen(8.5, 8.5, 1.0);
    expect(w.avatarAtScreen(me.x, me.y)).toBeNull();
    expect(w.avatarAtScreen(me.x, me.y, ['player'])?.id).toBe('me');
    const floor = gridToScreen(12.5, 1.5, 0);
    expect(w.avatarAtScreen(floor.x, floor.y)).toBeNull();
  });

  it('une joueuse devant une table : l’avatar ET le meuble sont sous le point', () => {
    const w = new LibraryWorld(
      { ...OPEN, items: [{ id: 'table', key: 'table', gx: 4, gy: 4, r: 0 }] },
      CATALOG
    );
    w.syncRemoteAvatars([remote({ tile: { i: 6, j: 6 } })], 0);
    const p = gridToScreen(6.5, 6.5, 0.5);
    // Le contrôleur vise les avatars d'abord (cf. libraryControllerSocial).
    expect(w.avatarAtScreen(p.x, p.y)?.id).toBe(IRIS);
  });
});

describe('l’arrivée de la joueuse', () => {
  it('est signalée une fois, et seulement pour la joueuse', () => {
    const w = makeWorld();
    w.syncRemoteAvatars(
      [remote({ target: { tile: { i: 2, j: 5 }, receivedAt: 1 } })],
      1
    );
    expect(w.walkTo('me', { i: 10, j: 8 })).toBe(true);
    run(w, 3);
    expect(w.takeArrivals()).toEqual(['me']);
    expect(w.takeArrivals()).toEqual([]);
  });
});
