// Unit tests — suggestion de créneau d'entraînement (N6).
//
// Une suggestion n'a de valeur que si on peut lui faire confiance. Ces tests
// verrouillent donc surtout ce qu'elle refuse de proposer :
//
//   - jamais un créneau déjà annoncé (suggérer ce que l'équipe vient de
//     publier ferait douter de tout le reste) ;
//   - jamais un créneau déjà exploité chaque semaine ;
//   - jamais plus d'UNE suggestion — une liste n'est pas une suggestion.

import { describe, it, expect } from 'vitest';

import {
  announcedSlotKeys,
  EXPLOITED_THRESHOLD,
  pickTrainingSlot,
  tallyPlayedBySlot,
} from '../../utils/teams/trainingSuggestion';
import {
  rhythmSlotKey,
  type RhythmHeatmap,
} from '../../utils/teams/teamRhythm';

const TUE_21 = rhythmSlotKey(2, 21 * 60);
const WED_21 = rhythmSlotKey(3, 21 * 60);
const THU_20 = rhythmSlotKey(4, 20 * 60);

/** Heatmap minimale : une case, N personnes. */
function heat(entries: Array<[string, number]>): RhythmHeatmap {
  const out: RhythmHeatmap = {};
  for (const [slot, count] of entries) {
    out[slot] = {
      count,
      userIds: Array.from({ length: count }, (_, i) => `u${i}`),
    };
  }
  return out;
}

describe('pickTrainingSlot', () => {
  it('propose le créneau de noyau jamais joué', () => {
    const suggestion = pickTrainingSlot({
      coreSlots: [TUE_21, WED_21],
      heatmap: heat([
        [TUE_21, 5],
        [WED_21, 5],
      ]),
      playedBySlot: new Map([[TUE_21, 4]]),
      announcedSlots: new Set(),
    });
    expect(suggestion).toEqual({
      slot: WED_21,
      availableCount: 5,
      playedCount: 0,
    });
  });

  it('ne propose jamais un créneau déjà annoncé', () => {
    // Suggérer ce que l'équipe vient de publier ferait douter du reste.
    const suggestion = pickTrainingSlot({
      coreSlots: [WED_21],
      heatmap: heat([[WED_21, 5]]),
      playedBySlot: new Map(),
      announcedSlots: new Set([WED_21]),
    });
    expect(suggestion).toBeNull();
  });

  it('ne propose pas un créneau déjà exploité', () => {
    const suggestion = pickTrainingSlot({
      coreSlots: [WED_21],
      heatmap: heat([[WED_21, 5]]),
      playedBySlot: new Map([[WED_21, EXPLOITED_THRESHOLD]]),
      announcedSlots: new Set(),
    });
    expect(suggestion).toBeNull();
  });

  it('tolère un créneau joué une seule fois — ça pouvait être un hasard', () => {
    const suggestion = pickTrainingSlot({
      coreSlots: [WED_21],
      heatmap: heat([[WED_21, 5]]),
      playedBySlot: new Map([[WED_21, 1]]),
      announcedSlots: new Set(),
    });
    expect(suggestion?.slot).toBe(WED_21);
    expect(suggestion?.playedCount).toBe(1);
  });

  it('préfère le créneau où le plus de monde est disponible', () => {
    // C'est ce qui rend le créneau jouable, donc la suggestion crédible.
    const suggestion = pickTrainingSlot({
      coreSlots: [THU_20, WED_21],
      heatmap: heat([
        [THU_20, 3],
        [WED_21, 6],
      ]),
      playedBySlot: new Map(),
      announcedSlots: new Set(),
    });
    expect(suggestion?.slot).toBe(WED_21);
  });

  it('départage par le moins exploité à disponibilité égale', () => {
    const suggestion = pickTrainingSlot({
      coreSlots: [THU_20, WED_21],
      heatmap: heat([
        [THU_20, 5],
        [WED_21, 5],
      ]),
      playedBySlot: new Map([[THU_20, 1]]),
      announcedSlots: new Set(),
    });
    expect(suggestion?.slot).toBe(WED_21);
  });

  it('départage par l’ordre de la semaine à égalité complète', () => {
    const suggestion = pickTrainingSlot({
      coreSlots: [THU_20, TUE_21],
      heatmap: heat([
        [THU_20, 5],
        [TUE_21, 5],
      ]),
      playedBySlot: new Map(),
      announcedSlots: new Set(),
    });
    expect(suggestion?.slot).toBe(TUE_21);
  });

  it('se tait quand il n’y a pas de noyau', () => {
    expect(
      pickTrainingSlot({
        coreSlots: [],
        heatmap: {},
        playedBySlot: new Map(),
        announcedSlots: new Set(),
      })
    ).toBeNull();
  });
});

describe('tallyPlayedBySlot', () => {
  it('range un affrontement dans la case horaire du fuseau demandé', () => {
    // 20 h UTC + 120 min = 22 h locales, un mercredi.
    const tally = tallyPlayedBySlot(['2026-07-01T20:00:00.000Z'], 120);
    expect(tally.get(rhythmSlotKey(3, 22 * 60))).toBe(1);
  });

  it('arrondit à l’heure pleine pour retomber sur la grille', () => {
    // Sans cet arrondi, un match à 21 h 15 ne coïnciderait avec aucune case et
    // tous les créneaux paraîtraient inexploités.
    const tally = tallyPlayedBySlot(
      ['2026-07-01T21:15:00.000Z', '2026-07-01T21:45:00.000Z'],
      0
    );
    expect(tally.get(rhythmSlotKey(3, 21 * 60))).toBe(2);
  });

  it('ignore les dates absentes ou illisibles', () => {
    const tally = tallyPlayedBySlot([null, 'pas-une-date'], 0);
    expect(tally.size).toBe(0);
  });
});

describe('announcedSlotKeys', () => {
  it('ramène des créneaux ISO à des clés de grille', () => {
    const keys = announcedSlotKeys(
      ['2026-07-01T20:00:00.000Z', '2026-07-08T20:00:00.000Z'],
      0
    );
    // Deux mercredis 20 h → une seule case.
    expect(Array.from(keys)).toEqual([rhythmSlotKey(3, 20 * 60)]);
  });
});
