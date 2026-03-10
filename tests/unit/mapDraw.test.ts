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

const CHOICES_PER_SLOT = 3;

/**
 * Reproduce the random draw logic from map-draw.tsx (3 choices per slot, same category).
 * Returns an array of slots, each slot being an array of CHOICES_PER_SLOT maps.
 */
function randomDraw(maps: FakeMap[], slotCount: number): FakeMap[][] {
  const byType: Record<string, FakeMap[]> = {};
  for (const m of maps) {
    const t = m.map_type || 'other';
    (byType[t] ??= []).push(m);
  }

  // Shuffle maps within each type
  for (const t of Object.keys(byType)) {
    byType[t] = shuffle(byType[t]);
  }

  const eligibleTypes = Object.keys(byType).filter((t) => byType[t].length >= CHOICES_PER_SLOT);

  const result: FakeMap[][] = [];
  const usedIds = new Set<string>();

  const shuffledTypes = shuffle(eligibleTypes);
  for (let s = 0; s < slotCount; s++) {
    let assigned = false;

    for (const t of shuffledTypes) {
      const available = byType[t].filter((m) => !usedIds.has(m.id));
      if (available.length >= CHOICES_PER_SLOT) {
        const picks = available.slice(0, CHOICES_PER_SLOT);
        result.push(picks);
        picks.forEach((p) => usedIds.add(p.id));
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      for (const t of Object.keys(byType)) {
        const available = byType[t].filter((m) => !usedIds.has(m.id));
        if (available.length >= CHOICES_PER_SLOT) {
          const picks = available.slice(0, CHOICES_PER_SLOT);
          result.push(picks);
          picks.forEach((p) => usedIds.add(p.id));
          assigned = true;
          break;
        }
      }
    }

    if (!assigned) {
      const remaining = maps.filter((m) => !usedIds.has(m.id));
      const picks = remaining.slice(0, CHOICES_PER_SLOT);
      result.push(picks);
      picks.filter(Boolean).forEach((p) => usedIds.add(p.id));
    }
  }

  return shuffle(result);
}

// Pool with enough maps for BO5 (15 needed): at least 3 per type × 5 groups
// With 4 types, some types need 6+ maps so the 5th slot can reuse a type
const POOL: FakeMap[] = [
  // Control (6)
  { id: '1', map_name: 'Busan', map_type: 'control' },
  { id: '2', map_name: 'Ilios', map_type: 'control' },
  { id: '3', map_name: 'Nepal', map_type: 'control' },
  { id: '4', map_name: 'Samoa', map_type: 'control' },
  { id: '4b', map_name: 'Oasis', map_type: 'control' },
  { id: '4c', map_name: 'Lijiang Tower', map_type: 'control' },
  // Escort (6)
  { id: '5', map_name: 'Dorado', map_type: 'escort' },
  { id: '6', map_name: 'Route 66', map_type: 'escort' },
  { id: '7', map_name: 'Junkertown', map_type: 'escort' },
  { id: '8', map_name: 'Circuit Royal', map_type: 'escort' },
  { id: '8b', map_name: 'Havana', map_type: 'escort' },
  { id: '8c', map_name: 'Rialto', map_type: 'escort' },
  // Hybrid (4)
  { id: '9', map_name: "King's Row", map_type: 'hybrid' },
  { id: '10', map_name: 'Eichenwalde', map_type: 'hybrid' },
  { id: '11', map_name: 'Hollywood', map_type: 'hybrid' },
  { id: '12', map_name: 'Midtown', map_type: 'hybrid' },
  // Push (4)
  { id: '13', map_name: 'Colosseo', map_type: 'push' },
  { id: '14', map_name: 'Esperança', map_type: 'push' },
  { id: '15', map_name: 'New Queen Street', map_type: 'push' },
  { id: '16', map_name: 'Runasapi', map_type: 'push' },
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

describe('randomDraw — 3 choix par slot', () => {
  it('tire 3 slots pour un BO3 (9 maps au total)', () => {
    const result = randomDraw(POOL, 3);
    expect(result.length).toBe(3);
    expect(result.flat().length).toBe(9);
  });

  it('tire 5 slots pour un BO5 (15 maps au total)', () => {
    const result = randomDraw(POOL, 5);
    expect(result.length).toBe(5);
    expect(result.flat().length).toBe(15);
  });

  it('chaque slot contient exactement 3 choix', () => {
    for (let i = 0; i < 20; i++) {
      const result = randomDraw(POOL, 3);
      for (const slot of result) {
        expect(slot.length).toBe(CHOICES_PER_SLOT);
      }
    }
  });

  it('ne tire jamais la même map deux fois (aucun doublon global)', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 5);
      const allIds = result.flat().map((m) => m.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    }
  });

  it('tire des maps qui existent dans le pool', () => {
    const poolIds = new Set(POOL.map((m) => m.id));
    for (let i = 0; i < 20; i++) {
      const result = randomDraw(POOL, 3);
      for (const m of result.flat()) {
        expect(poolIds.has(m.id)).toBe(true);
      }
    }
  });

  it('les 3 maps d\'un slot sont de la même catégorie', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 3);
      for (const slot of result) {
        const types = new Set(slot.map((m) => m.map_type));
        expect(types.size).toBe(1);
      }
    }
  });

  it('les 3 maps d\'un slot sont de la même catégorie (BO5)', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 5);
      for (const slot of result) {
        const types = new Set(slot.map((m) => m.map_type));
        expect(types.size).toBe(1);
      }
    }
  });

  it('favorise la variété des catégories entre slots (BO3 → au moins 2 catégories différentes)', () => {
    let multiCatCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 3);
      const slotTypes = result.map((slot) => slot[0].map_type);
      if (new Set(slotTypes).size >= 2) multiCatCount++;
    }
    expect(multiCatCount).toBeGreaterThanOrEqual(40);
  });

  it('favorise la variété des catégories entre slots (BO5 → au moins 3 catégories différentes)', () => {
    let multiCatCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = randomDraw(POOL, 5);
      const slotTypes = result.map((slot) => slot[0].map_type);
      if (new Set(slotTypes).size >= 3) multiCatCount++;
    }
    expect(multiCatCount).toBeGreaterThanOrEqual(40);
  });

  it('fonctionne avec un pool minimal (exactement 9 maps pour BO3)', () => {
    const smallPool = POOL.slice(0, 9);
    const result = randomDraw(smallPool, 3);
    expect(result.length).toBe(3);
    expect(result.flat().length).toBe(9);
    const allIds = result.flat().map((m) => m.id);
    expect(new Set(allIds).size).toBe(9);
  });

  it('fonctionne quand toutes les maps sont du même type', () => {
    const sameType: FakeMap[] = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      map_name: `Map ${i}`,
      map_type: 'control',
    }));
    const result = randomDraw(sameType, 3);
    expect(result.length).toBe(3);
    for (const slot of result) {
      expect(slot.length).toBe(CHOICES_PER_SLOT);
      const types = new Set(slot.map((m) => m.map_type));
      expect(types.size).toBe(1);
      expect(types.has('control')).toBe(true);
    }
  });

  it('gère le cas où certaines catégories ont moins de 3 maps', () => {
    // 3 control, 3 escort, 3 hybrid, 1 push (10 maps)
    const mixedPool: FakeMap[] = [
      { id: 'a1', map_name: 'C1', map_type: 'control' },
      { id: 'a2', map_name: 'C2', map_type: 'control' },
      { id: 'a3', map_name: 'C3', map_type: 'control' },
      { id: 'b1', map_name: 'E1', map_type: 'escort' },
      { id: 'b2', map_name: 'E2', map_type: 'escort' },
      { id: 'b3', map_name: 'E3', map_type: 'escort' },
      { id: 'c1', map_name: 'H1', map_type: 'hybrid' },
      { id: 'c2', map_name: 'H2', map_type: 'hybrid' },
      { id: 'c3', map_name: 'H3', map_type: 'hybrid' },
      { id: 'd1', map_name: 'P1', map_type: 'push' },
    ];
    // BO3 needs 9 maps — only 3 types eligible (push has only 1)
    const result = randomDraw(mixedPool, 3);
    expect(result.length).toBe(3);
    expect(result.flat().length).toBe(9);
    // Each slot should still have 3 maps
    for (const slot of result) {
      expect(slot.length).toBe(CHOICES_PER_SLOT);
    }
  });
});
