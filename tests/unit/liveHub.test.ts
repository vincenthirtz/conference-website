// tests/unit/liveHub.test.ts
//
// Couvre utils/tournament/liveHub.ts (buildLiveHub, hasResult).

import { describe, it, expect } from 'vitest';
import {
  buildLiveHub,
  hasResult,
  type HubMatch,
} from '../../utils/tournament/liveHub';

function match(overrides: Partial<HubMatch> & { id: string }): HubMatch {
  return {
    scheduled_at: null,
    status: 'pending',
    is_bye: false,
    round_name: null,
    match_format: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    forfeit_team_id: null,
    stream_url: null,
    team1: null,
    team2: null,
    ...overrides,
  };
}

const NOW = new Date('2026-09-24T12:00:00Z');

describe('hasResult', () => {
  it('un match terminé est un résultat', () => {
    expect(hasResult(match({ id: 'a', status: 'finished' }))).toBe(true);
  });
  it('un forfait avec vainqueur est un résultat', () => {
    expect(
      hasResult(match({ id: 'a', status: 'walkover', winner_team_id: 't1' }))
    ).toBe(true);
  });
  it('un forfait sans vainqueur (forfait annulé à moitié) n’en est pas un', () => {
    expect(hasResult(match({ id: 'a', status: 'walkover' }))).toBe(false);
  });
});

describe('buildLiveHub', () => {
  const matches: HubMatch[] = [
    match({
      id: 'old',
      status: 'finished',
      scheduled_at: '2026-09-18T17:00:00Z',
      round_name: 'J1',
    }),
    match({
      id: 'last',
      status: 'finished',
      scheduled_at: '2026-09-23T20:00:00Z',
      round_name: 'J2',
    }),
    match({
      id: 'wo-ok',
      status: 'walkover',
      winner_team_id: 'x',
      scheduled_at: '2026-09-20T17:00:00Z',
    }),
    match({
      id: 'wo-ko',
      status: 'walkover',
      scheduled_at: '2026-10-02T17:00:00Z',
    }),
    match({
      id: 'late',
      status: 'pending',
      scheduled_at: '2026-09-24T10:00:00Z',
      round_name: 'J2',
    }),
    match({
      id: 'stale',
      status: 'pending',
      scheduled_at: '2026-09-20T10:00:00Z',
    }),
    match({
      id: 'next',
      status: 'pending',
      scheduled_at: '2026-09-25T18:30:00Z',
      round_name: 'J3',
    }),
    match({
      id: 'after',
      status: 'pending',
      scheduled_at: '2026-09-25T20:00:00Z',
    }),
    match({
      id: 'far',
      status: 'pending',
      scheduled_at: '2026-10-23T18:00:00Z',
    }),
    match({ id: 'undated', status: 'pending' }),
    match({
      id: 'live',
      status: 'ongoing',
      scheduled_at: '2026-09-24T11:30:00Z',
      round_name: 'J2',
    }),
    match({
      id: 'bye',
      status: 'finished',
      is_bye: true,
      scheduled_at: '2026-09-24T09:00:00Z',
    }),
    match({
      id: 'off',
      status: 'cancelled',
      scheduled_at: '2026-09-26T09:00:00Z',
    }),
  ];

  it('sépare direct, à suivre (avec marge de 3 h) et derniers résultats', () => {
    const hub = buildLiveHub(matches, NOW);
    expect(hub.live.map((m) => m.id)).toEqual(['live']);
    // « late » (il y a 2 h, score pas encore saisi) reste à suivre ; « stale »
    // (4 jours) et le match sans horaire n'y sont pas.
    expect(hub.upcoming.map((m) => m.id)).toEqual(['late', 'next', 'after']);
    expect(hub.recent.map((m) => m.id)).toEqual(['last', 'wo-ok', 'old']);
  });

  it('compte l’avancement hors byes et annulés, sans le forfait sans vainqueur', () => {
    const hub = buildLiveHub(matches, NOW);
    expect(hub.played).toBe(3);
    expect(hub.total).toBe(11);
    expect(hub.nextRound).toBe('J2');
  });

  it('respecte les limites', () => {
    const hub = buildLiveHub(matches, NOW, { upcoming: 1, recent: 1 });
    expect(hub.upcoming).toHaveLength(1);
    expect(hub.recent.map((m) => m.id)).toEqual(['last']);
    expect(hub.played).toBe(3);
  });

  it('tournoi vide', () => {
    const hub = buildLiveHub([], NOW);
    expect(hub).toEqual({
      live: [],
      upcoming: [],
      recent: [],
      played: 0,
      total: 0,
      nextRound: null,
    });
  });
});
