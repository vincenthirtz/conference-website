import { describe, expect, it } from 'vitest';
import {
  centerDepth,
  compareBoxes,
  depthSort,
  screenOverlap,
  type Box3,
} from '../../features/player/library/engine/depthSort';
import {
  AVATAR_HEIGHT,
  AVATAR_RADIUS,
  avatarBox,
  itemBox,
} from '../../features/player/library/engine/room';
import { mulberry32 } from '../../features/player/library/engine/world';

type Node = { id: string; box: Box3 };

// Cases de 0,5 m ; hauteurs en mètres.
const SHELF_SPEC = { footprint: { w: 3, d: 2 }, height: 2 };
/** Rayonnage 3 × 2 posé en (10, 10), r = 0 : x ∈ [10, 13], y ∈ [10, 12]. */
const shelf: Node = {
  id: 'shelf',
  box: itemBox(
    { id: 'shelf', key: 'bookshelf', gx: 10, gy: 10, r: 0 },
    SHELF_SPEC
  ),
};
/** Avatar debout au centre de la case (i, j). */
const avatarOn = (id: string, i: number, j: number): Node => ({
  id,
  box: avatarBox(i + 0.5, j + 0.5),
});

const order = (nodes: Node[]) => depthSort(nodes).map((n) => n.id);

/** Toute paire ordonnée par compareBoxes l'est aussi dans le résultat. */
function assertConsistent(nodes: Node[]): void {
  const sorted = depthSort(nodes);
  const pos = new Map(sorted.map((n, k) => [n.id, k]));
  for (const a of nodes)
    for (const b of nodes) {
      if (a === b) continue;
      if (compareBoxes(a.box, b.box) === 1)
        expect(pos.get(a.id) ?? -1).toBeGreaterThan(pos.get(b.id) ?? -1);
    }
}

describe('boîte d’avatar', () => {
  it('0,45 m de côté (0,9 case), 1,65 m de haut, tient dans sa case', () => {
    expect(AVATAR_RADIUS * 2).toBeCloseTo(0.9, 12);
    expect(AVATAR_HEIGHT).toBe(1.65);
    const b = avatarBox(4.5, 7.5);
    expect(b.minX).toBeGreaterThan(4);
    expect(b.maxX).toBeLessThan(5);
    expect(b.maxZ).toBe(1.65);
  });
});

describe('screenOverlap', () => {
  it('des boîtes éloignées ou qui se touchent seulement ne se recouvrent pas', () => {
    const a = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    expect(screenOverlap(a, { ...a, minX: 5, maxX: 6 })).toBe(false);
    // Côte à côte le long de x : décalage bas-droite, les hexagones se
    // recouvrent (la face commune se projette sur une surface).
    expect(screenOverlap(a, { ...a, minX: 1, maxX: 2 })).toBe(true);
    // (1, −1) : décalage purement horizontal à l'écran, contact sur une arête.
    expect(
      screenOverlap(a, { ...a, minX: 1, maxX: 2, minY: -1, maxY: 0 })
    ).toBe(false);
  });
});

describe('depthSort — avatar et rayonnage 3 × 2', () => {
  it('avatar devant le rayonnage (côté +y) : dessiné après', () => {
    const me = avatarOn('me', 11, 12);
    expect(screenOverlap(me.box, shelf.box)).toBe(true);
    expect(order([me, shelf])).toEqual(['shelf', 'me']);
    expect(order([shelf, avatarOn('me', 12, 12)])).toEqual(['shelf', 'me']);
  });

  it('avatar derrière le rayonnage (côté −y) : dessiné avant', () => {
    const me = avatarOn('me', 11, 9);
    expect(screenOverlap(me.box, shelf.box)).toBe(true);
    expect(order([shelf, me])).toEqual(['me', 'shelf']);
    expect(order([shelf, avatarOn('me', 10, 9)])).toEqual(['me', 'shelf']);
  });

  it('avatar à droite (côté +x) : devant ; à gauche (côté −x) : derrière', () => {
    expect(order([avatarOn('me', 13, 11), shelf])).toEqual(['shelf', 'me']);
    const left = avatarOn('me', 9, 11);
    expect(screenOverlap(left.box, shelf.box)).toBe(true);
    expect(order([shelf, left])).toEqual(['me', 'shelf']);
  });

  it('là où un tri naïf sur gx + gy de l’origine se trompe', () => {
    const me = avatarOn('me', 12, 9); // derrière la partie droite du rayonnage
    expect(screenOverlap(me.box, shelf.box)).toBe(true);
    // Naïf : origine de l'avatar (12,05 + 9,05) > origine du rayonnage
    // (10 + 10) → l'avatar passerait DEVANT, à tort.
    expect(me.box.minX + me.box.minY).toBeGreaterThan(
      shelf.box.minX + shelf.box.minY
    );
    expect(compareBoxes(shelf.box, me.box)).toBe(1);
    expect(order([shelf, me])).toEqual(['me', 'shelf']);
  });

  it('là où un tri sur le centre se trompe (meuble long 8 × 1)', () => {
    const counter: Node = {
      id: 'counter',
      box: { minX: 4, maxX: 12, minY: 10, maxY: 11, minZ: 0, maxZ: 1.1 },
    };
    const me = avatarOn('me', 11, 9);
    expect(screenOverlap(me.box, counter.box)).toBe(true);
    expect(centerDepth(me.box)).toBeGreaterThan(centerDepth(counter.box));
    expect(order([counter, me])).toEqual(['me', 'counter']);
  });
});

describe('depthSort — autres cas', () => {
  it('objet posé sur un autre (séparation en z) : le dessus après', () => {
    const table: Node = {
      id: 'table',
      box: { minX: 2, maxX: 6, minY: 2, maxY: 4, minZ: 0, maxZ: 0.75 },
    };
    const book: Node = {
      id: 'book',
      box: { minX: 2.4, maxX: 3, minY: 2.4, maxY: 2.8, minZ: 0.75, maxZ: 0.8 },
    };
    expect(order([book, table])).toEqual(['table', 'book']);
  });

  it('sans recouvrement à l’écran, aucune contrainte', () => {
    expect(compareBoxes(avatarOn('a', 0, 0).box, avatarOn('b', 9, 0).box)).toBe(
      0
    );
  });

  it('scène complète : ordre cohérent quel que soit l’ordre d’entrée', () => {
    const lamp: Node = {
      id: 'lamp',
      box: { minX: 13, maxX: 15, minY: 10, maxY: 11, minZ: 0, maxZ: 1.6 },
    };
    const nodes = [
      shelf,
      lamp,
      avatarOn('behind', 11, 9),
      avatarOn('front', 11, 12),
      avatarOn('left', 9, 11),
      avatarOn('far', 1, 1),
    ];
    const rand = mulberry32(3);
    for (let n = 0; n < 20; n++) {
      const shuffled = [...nodes].sort(() => rand() - 0.5);
      assertConsistent(shuffled);
      const ids = order(shuffled);
      expect(ids.indexOf('behind')).toBeLessThan(ids.indexOf('shelf'));
      expect(ids.indexOf('left')).toBeLessThan(ids.indexOf('shelf'));
      expect(ids.indexOf('front')).toBeGreaterThan(ids.indexOf('shelf'));
      expect(ids.indexOf('shelf')).toBeLessThan(ids.indexOf('lamp'));
    }
  });

  it('30 avatars mêlés aux meubles : tout est rendu, contraintes respectées', () => {
    const rand = mulberry32(11);
    const nodes: Node[] = [shelf];
    for (let k = 0; k < 30; k++)
      // y < 9 : les avatars ne traversent pas le rayonnage (y ≥ 10).
      nodes.push({ id: `a${k}`, box: avatarBox(rand() * 24, rand() * 9) });
    const sorted = depthSort(nodes);
    expect(sorted).toHaveLength(nodes.length);
    expect(new Set(sorted.map((n) => n.id)).size).toBe(nodes.length);
    // Le rayonnage reste devant tout avatar qui se trouve derrière lui.
    const pos = new Map(sorted.map((n, k) => [n.id, k]));
    for (const n of nodes)
      if (n !== shelf && compareBoxes(shelf.box, n.box) === 1)
        expect(pos.get('shelf') ?? -1).toBeGreaterThan(pos.get(n.id) ?? -1);
  });

  it('boîtes qui s’interpénètrent : départage par le centre, sans planter', () => {
    const a = avatarOn('a', 3, 3);
    const b: Node = { id: 'b', box: avatarBox(3.8, 3.8) };
    expect(order([b, a])).toEqual(['a', 'b']);
  });
});
