// tests/unit/sessionEntry.test.ts
//
// Couvre utils/matches/sessionEntry.ts.

import { describe, it, expect } from 'vitest';
import {
  defaultSessionDay,
  groupMatchesByDay,
  needsEntry,
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
