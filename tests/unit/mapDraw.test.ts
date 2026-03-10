import { describe, it, expect } from 'vitest';

// Reproduce the shuffle function from map-draw.tsx for unit testing
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type FakeMap = {
  id: string;
  map_name: string;
  map_type: string;
};

/** Reproduce the random draw logic from map-draw.tsx */
function randomDraw(maps: FakeMap[], mapCount: number): FakeMap[] {
  const byType: Record<string, FakeMap[]> = {};
  for (const m of maps) {
    const t = m.map_type || 'other';
    (byType[t] ??= []).push(m);
  }

  const types = Object.keys(byType);
  const drawn: FakeMap[] = [];
  const usedIds = new Set<string>();

  const shuffledTypes = shuffle(types);
  for (const t of shuffledTypes) {
    if (drawn.length >= mapCount) break;
    const candidates = byType[t].filter((m) => !usedIds.has(m.id));
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      drawn.push(pick);
      usedIds.add(pick.id);
    }
  }

  if (drawn.length < mapCount) {
    const remaining = shuffle(maps.filter((m) => !usedIds.has(m.id)));
    for (const m of remaining) {
      if (drawn.length >= mapCount) break;
      drawn.push(m);
    }
  }

  return shuffle(drawn);
}

const POOL: FakeMap[] = [
  { id: '1', map_name: 'Busan', map_type: 'control' },
  { id: '2', map_name: 'Ilios', map_type: 'control' },
  { id: '3', map_name: 'Nepal', map_type: 'control' },
  { id: '4', map_name: 'Dorado', map_type: 'escort' },
  { id: '5', map_name: 'Route 66', map_type: 'escort' },
  { id: '6', map_name: 'King\'s Row', map_type: 'hybrid' },
  { id: '7', map_name: 'Eichenwalde', map_type: 'hybrid' },
  { id: '8', map_name: 'Colosseo', map_type: 'push' },
  { id: '9', map_name: 'Esperança', map_type: 'push' },
  { id: '10', map_name: 'Hollywood', map_type: 'hybrid' },
];

describe('shuffle (Fisher-Yates)', () => {
  it('retourne un tableau de même taille', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.length).toBe(arr.length);
  });

  it('contient les mêmes éléments', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('ne modifie pas le tableau original', () => {
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    shuffle(arr);
    expect(arr).toEqual(original);
  });

  it('gère un tableau vide', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('gère un tableau à un élément', () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

describe('randomDraw (tirage aléatoire)', () => {
  it('tire exactement 3 maps pour un BO3', () => {
    const result = randomDraw(POOL, 3);
    expect(result.length).toBe(3);
  });

  it('tire exactement 5 maps pour un BO5', () => {
    const result = randomDraw(POOL, 5);
    expect(result.length).toBe(5);
  });

  it('ne tire jamais la même map deux fois', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 5);
      const ids = result.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('tire des maps qui existent dans le pool', () => {
    const poolIds = new Set(POOL.map((m) => m.id));
    for (let i = 0; i < 20; i++) {
      const result = randomDraw(POOL, 3);
      for (const m of result) {
        expect(poolIds.has(m.id)).toBe(true);
      }
    }
  });

  it('favorise la variété des types (BO3 → au moins 2 types différents sur 50 essais)', () => {
    let multiTypeCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 3);
      const types = new Set(result.map((m) => m.map_type));
      if (types.size >= 2) multiTypeCount++;
    }
    // With 4 types available, the algorithm should give variety most of the time
    expect(multiTypeCount).toBeGreaterThanOrEqual(40);
  });

  it('favorise la variété des types (BO5 → au moins 3 types différents sur 50 essais)', () => {
    let multiTypeCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 5);
      const types = new Set(result.map((m) => m.map_type));
      if (types.size >= 3) multiTypeCount++;
    }
    expect(multiTypeCount).toBeGreaterThanOrEqual(40);
  });

  it('fonctionne avec un pool minimal (exactement le nombre demandé)', () => {
    const smallPool = POOL.slice(0, 3);
    const result = randomDraw(smallPool, 3);
    expect(result.length).toBe(3);
    const ids = new Set(result.map((m) => m.id));
    expect(ids.size).toBe(3);
  });

  it('fonctionne quand tous les maps sont du même type', () => {
    const sameType: FakeMap[] = [
      { id: 'a', map_name: 'A', map_type: 'control' },
      { id: 'b', map_name: 'B', map_type: 'control' },
      { id: 'c', map_name: 'C', map_type: 'control' },
    ];
    const result = randomDraw(sameType, 3);
    expect(result.length).toBe(3);
  });
});
