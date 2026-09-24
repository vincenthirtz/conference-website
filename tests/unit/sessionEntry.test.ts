// tests/unit/sessionEntry.test.ts
//
// Couvre utils/matches/sessionEntry.ts.

import { describe, it, expect } from 'vitest';
import {
  defaultSessionDay,
  groupMatchesByDay,
  needsEntry,
  mapSlots,
  blankGame,
  prepareGamesForSave,
  type SessionMatch,
} from '../../utils/matches/sessionEntry';

function m(
  id: string,
  scheduled_at: string | null,
  over: Partial<SessionMatch> = {}
): SessionMatch {
  return {
    id,
    scheduled_at,
    status: 'finished',
    is_bye: false,
    team1_id: 'A',
    team2_id: 'B',
    games: [],
    ...over,
  };
}

const TODAY = '2026-09-24';

describe('needsEntry', () => {
  it('match joué sans parties : à saisir', () => {
    expect(needsEntry(m('x', '2026-09-23T18:30:00Z'), TODAY)).toBe(true);
  });
  it('parties déjà saisies : non', () => {
    expect(
      needsEntry(m('x', '2026-09-23T18:30:00Z', { games: [{}] }), TODAY)
    ).toBe(false);
  });
  it('forfait, bye, équipes inconnues ou match à venir : non', () => {
    expect(
      needsEntry(m('x', '2026-09-23T18:30:00Z', { status: 'walkover' }), TODAY)
    ).toBe(false);
    expect(
      needsEntry(m('x', '2026-09-23T18:30:00Z', { is_bye: true }), TODAY)
    ).toBe(false);
    expect(
      needsEntry(m('x', '2026-09-23T18:30:00Z', { team2_id: null }), TODAY)
    ).toBe(false);
    expect(
      needsEntry(m('x', '2026-09-25T18:30:00Z', { status: 'pending' }), TODAY)
    ).toBe(false);
  });
  it('le jour est celui de Paris : 22h30 UTC le 23 = 00h30 le 24 à Paris', () => {
    expect(needsEntry(m('x', '2026-09-24T22:30:00Z'), TODAY)).toBe(false);
    expect(needsEntry(m('x', '2026-09-23T22:30:00Z'), TODAY)).toBe(true);
  });
});

describe('groupMatchesByDay / defaultSessionDay', () => {
  const matches = [
    m('late', '2026-09-23T20:00:00Z'),
    m('early', '2026-09-23T18:30:00Z', { games: [{}] }),
    m('old', '2026-09-18T17:00:00Z', { games: [{}] }),
    m('next', '2026-09-25T18:30:00Z', { status: 'pending' }),
    m('off', '2026-09-26T18:30:00Z', { status: 'cancelled' }),
    m('undated', null),
  ];

  it('regroupe par jour de Paris, trie les matchs par horaire, compte les trous', () => {
    const days = groupMatchesByDay(matches, TODAY);
    expect(days.map((d) => d.day)).toEqual([
      '2026-09-18',
      '2026-09-23',
      '2026-09-25',
    ]);
    expect(days[1].matches.map((x) => x.id)).toEqual(['early', 'late']);
    expect(days.map((d) => d.toFill)).toEqual([0, 1, 0]);
  });

  it('ouvre la soirée récente qui a encore des trous', () => {
    const days = groupMatchesByDay(matches, TODAY);
    expect(defaultSessionDay(days, TODAY)).toBe('2026-09-23');
  });

  it('sans trou : la dernière soirée jouée ; avant le tournoi : la première', () => {
    const complete = groupMatchesByDay(
      matches.map((x) => ({ ...x, games: [{}] })),
      TODAY
    );
    expect(defaultSessionDay(complete, TODAY)).toBe('2026-09-23');
    expect(defaultSessionDay(complete, '2026-09-01')).toBe('2026-09-18');
    expect(defaultSessionDay([], TODAY)).toBeNull();
  });
});

describe('emplacements de maps', () => {
  it('mapSlots : BO3 → 3 dont 2 obligatoires, BO5 → 5 dont 3, inconnu → BO3', () => {
    expect(mapSlots('bo3')).toEqual({ slots: 3, required: 2 });
    expect(mapSlots('BO5')).toEqual({ slots: 5, required: 3 });
    expect(mapSlots('bo1')).toEqual({ slots: 1, required: 1 });
    expect(mapSlots(null)).toEqual({ slots: 3, required: 2 });
    expect(mapSlots('ft2')).toEqual({ slots: 3, required: 2 });
  });

  it('retire la Map 3 non jouée et renumérote', () => {
    const games = [
      { ...blankGame(0), map_name: 'Oasis', team1_score: 1 },
      { ...blankGame(1), map_name: 'Hollywood', team1_score: 1 },
      blankGame(2),
    ];
    const out = prepareGamesForSave(games, 2);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.games.map((g) => [g.map_name, g.map_order])).toEqual([
        ['Oasis', 0],
        ['Hollywood', 1],
      ]);
    }
  });

  it('refuse une map remplie sans nom, ou moins que le minimum', () => {
    expect(
      prepareGamesForSave([{ ...blankGame(0), team1_score: 1 }], 1)
    ).toEqual({ ok: false, error: 'unnamed_map' });
    expect(
      prepareGamesForSave(
        [{ ...blankGame(0), map_name: 'Oasis' }, blankGame(1)],
        2
      )
    ).toEqual({ ok: false, error: 'missing_required', count: 2 });
  });

  it('aucune map remplie : rien à enregistrer, pas une erreur', () => {
    expect(prepareGamesForSave([blankGame(0), blankGame(1)], 2)).toEqual({
      ok: true,
      games: [],
    });
  });
});
