// tests/unit/finalsPhase.test.ts
//
// Couvre utils/tournament/finalsPhase.ts et utils/stages/bracketStage.ts.

import { describe, it, expect } from 'vitest';
import {
  buildFinalsPhase,
  type FinalsMatch,
  type RaceMatch,
} from '../../utils/tournament/finalsPhase';
import { bracketTabMode } from '../../utils/stages/bracketStage';
import type { PublicStandingRow } from '../../utils/stages/publicStandings';

function row(
  rank: number,
  id: string,
  wins: number,
  losses: number
): PublicStandingRow {
  return {
    rank,
    teamId: id,
    teamName: `Team ${id}`,
    shortName: null,
    slug: id.toLowerCase(),
    logoUrl: null,
    played: wins + losses,
    wins,
    losses,
    draws: 0,
    points: wins * 3,
    mapsWon: wins * 2,
    mapsLost: losses * 2,
    form: [],
    tiebrokenBy: null,
  };
}

function final(id: string, round: number, name: string): FinalsMatch {
  return {
    id,
    round_number: round,
    round_name: name,
    scheduled_at: '2026-10-23T18:30:00Z',
    status: 'pending',
    match_format: 'bo5',
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    team1: null,
    team2: null,
  };
}

const FINALS = [
  final('pf', 8, 'Petite finale'),
  final('gf', 9, 'Grande finale'),
];

function pending(a: string, b: string): RaceMatch {
  return { team1_id: a, team2_id: b, status: 'pending', is_bye: false };
}

describe('bracketTabMode', () => {
  it('championnat sans phase à élimination → finals', () => {
    expect(bracketTabMode([{ stage_type: 'round_robin' }])).toBe('finals');
    expect(bracketTabMode(['group', 'swiss'])).toBe('finals');
  });
  it('au moins une phase bracket → bracket', () => {
    expect(bracketTabMode(['round_robin', 'bracket'])).toBe('bracket');
  });
  it('aucune phase → bracket (format encore inconnu)', () => {
    expect(bracketTabMode([])).toBe('bracket');
    expect(bracketTabMode(null)).toBe('bracket');
  });
});

describe('buildFinalsPhase', () => {
  it('grande finale 1–2 en tête, petite finale 3–4, projetées depuis le classement', () => {
    const standings = [
      row(1, 'A', 2, 0),
      row(2, 'B', 2, 0),
      row(3, 'C', 1, 1),
      row(4, 'D', 1, 1),
      row(5, 'E', 0, 2),
    ];
    const out = buildFinalsPhase({
      standings,
      finals: FINALS,
      raceMatches: [pending('A', 'E')],
    });
    expect(out.cards.map((c) => c.match.id)).toEqual(['gf', 'pf']);
    expect(
      out.cards[0].slots.map((s) => [s.seed, s.team?.id, s.projected])
    ).toEqual([
      [1, 'A', true],
      [2, 'B', true],
    ]);
    expect(out.cards[1].slots.map((s) => s.team?.id)).toEqual(['C', 'D']);
    expect(out.qualifiers).toBe(4);
    expect(out.race.map((r) => r.zone)).toEqual([0, 0, 1, 1, null]);
  });

  it('aucune projection avant le premier match', () => {
    const out = buildFinalsPhase({
      standings: [row(1, 'A', 0, 0), row(2, 'B', 0, 0)],
      finals: [final('gf', 9, 'Grande finale')],
      raceMatches: [pending('A', 'B')],
    });
    expect(out.seasonStarted).toBe(false);
    expect(out.cards[0].slots.every((s) => s.team === null)).toBe(true);
  });

  it('les équipes placées sur le match l’emportent sur la projection', () => {
    const placed = {
      ...final('gf', 9, 'Grande finale'),
      team1: {
        id: 'B',
        slug: 'b',
        name: 'Team B',
        short_name: null,
        logo_url: null,
      },
    };
    const out = buildFinalsPhase({
      standings: [row(1, 'A', 3, 0), row(2, 'B', 2, 1)],
      finals: [placed],
      raceMatches: [],
    });
    expect(out.cards[0].slots[0]).toMatchObject({
      team: { id: 'B' },
      projected: false,
    });
    expect(out.cards[0].slots[1]).toMatchObject({
      team: { id: 'B' },
      projected: true,
    });
  });

  it('qualifiée / éliminée seulement quand c’est mathématiquement acquis', () => {
    // 1 finale (2 qualifiées). Il reste 1 match à chacune de C, D.
    const standings = [
      row(1, 'A', 5, 0), // 15 pts, plus rien à jouer
      row(2, 'B', 4, 1), // 12 pts
      row(3, 'C', 3, 2), // 9 pts, 1 match → 12 max : peut encore égaler B
      row(4, 'D', 1, 4), // 3 pts, 1 match → 6 max < 12 : éliminée
    ];
    const out = buildFinalsPhase({
      standings,
      finals: [final('gf', 9, 'Grande finale')],
      raceMatches: [pending('C', 'D')],
    });
    const byId = Object.fromEntries(out.race.map((r) => [r.teamId, r]));
    expect(byId.A.status).toBe('qualified');
    // B : C peut encore atteindre 12 → avec A, 2 rivales ≥ 2 qualifiées.
    expect(byId.B.status).toBe('contention');
    expect(byId.C.status).toBe('contention');
    expect(byId.D.status).toBe('eliminated');
    expect(byId.C.remaining).toBe(1);
    expect(byId.C.maxPoints).toBe(12);
  });

  it('saison terminée : les rangs tranchent', () => {
    const out = buildFinalsPhase({
      standings: [row(1, 'A', 2, 0), row(2, 'B', 1, 1), row(3, 'C', 0, 2)],
      finals: [final('gf', 9, 'Grande finale')],
      raceMatches: [
        { team1_id: 'A', team2_id: 'B', status: 'finished', is_bye: false },
      ],
    });
    expect(out.seasonOver).toBe(true);
    expect(out.race.map((r) => r.status)).toEqual([
      'qualified',
      'qualified',
      'eliminated',
    ]);
  });
});
