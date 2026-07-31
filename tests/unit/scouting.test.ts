// Unit tests — dossier d'adversaire (N5), cœur pur.
//
// Trois zones de risque, dans l'ordre où elles feraient du dégât :
//
//   - le CALCUL D'ISSUE. Une équipe est team1 ici, team2 là ; se tromper de
//     côté transforme une défaite en victoire dans toute la préparation.
//   - le SEUIL D'ÉCHANTILLON. Une « forme » sur un match est une anecdote
//     présentée comme une tendance — chaque section doit savoir se taire.
//   - les ADVERSAIRES COMMUNS, qui ne doivent jamais inclure ni la cible ni
//     moi-même : « vous avez battu vous-mêmes » n'est pas un renseignement.

import { describe, it, expect } from 'vitest';

import {
  buildScoutingReport,
  FORM_LENGTH,
  HEAD_TO_HEAD_LIMIT,
  resultFor,
  SCOUT_MIN_SAMPLE,
  type PlayedGame,
} from '../../utils/teams/scouting';

const ME = 'me';
const THEM = 'them';
const OTHER = 'other';

let seq = 0;
function game(over: Partial<PlayedGame> = {}): PlayedGame {
  seq += 1;
  return {
    subjectType: 'match',
    subjectId: `g${seq}`,
    playedAt: '2026-07-01T20:00:00.000Z',
    team1Id: ME,
    team2Id: THEM,
    team1Score: null,
    team2Score: null,
    winnerTeamId: null,
    ...over,
  };
}

describe('resultFor', () => {
  it('lit le vainqueur quel que soit le côté', () => {
    expect(resultFor(game({ winnerTeamId: ME }), ME)).toBe('win');
    expect(
      resultFor(game({ team1Id: THEM, team2Id: ME, winnerTeamId: ME }), ME)
    ).toBe('win');
    expect(resultFor(game({ winnerTeamId: THEM }), ME)).toBe('loss');
  });

  it('retombe sur les scores quand aucun vainqueur n’est posé', () => {
    expect(resultFor(game({ team1Score: 3, team2Score: 1 }), ME)).toBe('win');
    expect(
      resultFor(
        game({ team1Id: THEM, team2Id: ME, team1Score: 3, team2Score: 1 }),
        ME
      )
    ).toBe('loss');
    expect(resultFor(game({ team1Score: 2, team2Score: 2 }), ME)).toBe('draw');
  });

  it('refuse d’inventer un résultat sans vainqueur ni score', () => {
    // Le compter comme nul fabriquerait une statistique à partir de rien.
    expect(resultFor(game(), ME)).toBeNull();
  });

  it('renvoie null pour une équipe qui n’a pas joué la rencontre', () => {
    expect(resultFor(game({ winnerTeamId: ME }), OTHER)).toBeNull();
  });
});

describe('confrontations directes', () => {
  it('compte le bilan et détaille les plus récentes', () => {
    const games = [
      game({ playedAt: '2026-07-01T20:00:00.000Z', winnerTeamId: ME }),
      game({ playedAt: '2026-07-10T20:00:00.000Z', winnerTeamId: THEM }),
      game({
        playedAt: '2026-07-15T20:00:00.000Z',
        team1Score: 2,
        team2Score: 2,
      }),
    ];
    const report = buildScoutingReport(ME, THEM, games, games);
    expect(report.headToHead.played).toBe(3);
    expect(report.headToHead.wins).toBe(1);
    expect(report.headToHead.losses).toBe(1);
    expect(report.headToHead.draws).toBe(1);
    // Plus récente d'abord.
    expect(report.headToHead.recent[0].playedAt).toBe(
      '2026-07-15T20:00:00.000Z'
    );
  });

  it('donne le score du point de vue de MON équipe, quel que soit le côté', () => {
    const games = [
      game({
        team1Id: THEM,
        team2Id: ME,
        team1Score: 1,
        team2Score: 3,
      }),
    ];
    const report = buildScoutingReport(ME, THEM, games, games);
    expect(report.headToHead.recent[0].myScore).toBe(3);
    expect(report.headToHead.recent[0].opponentScore).toBe(1);
    expect(report.headToHead.recent[0].result).toBe('win');
  });

  it('plafonne le détail sans fausser le bilan', () => {
    const games = Array.from({ length: HEAD_TO_HEAD_LIMIT + 4 }, () =>
      game({ winnerTeamId: ME })
    );
    const report = buildScoutingReport(ME, THEM, games, games);
    expect(report.headToHead.played).toBe(HEAD_TO_HEAD_LIMIT + 4);
    expect(report.headToHead.recent).toHaveLength(HEAD_TO_HEAD_LIMIT);
  });

  it('ignore les rencontres contre quelqu’un d’autre', () => {
    const games = [
      game({ team2Id: OTHER, winnerTeamId: ME }),
      game({ winnerTeamId: ME }),
    ];
    const report = buildScoutingReport(ME, THEM, games, games);
    expect(report.headToHead.played).toBe(1);
  });
});

describe('forme et bilan de la cible', () => {
  const theirGames = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      game({
        team1Id: THEM,
        team2Id: OTHER,
        winnerTeamId: i % 2 === 0 ? THEM : OTHER,
        playedAt: `2026-07-${String(i + 1).padStart(2, '0')}T20:00:00.000Z`,
      })
    );

  it('se tait sous le seuil d’échantillon', () => {
    const report = buildScoutingReport(
      ME,
      THEM,
      [],
      theirGames(SCOUT_MIN_SAMPLE - 1)
    );
    expect(report.recentForm).toBeNull();
    expect(report.record).toBeNull();
    expect(report.usualSlots).toBeNull();
  });

  it('parle dès le seuil atteint', () => {
    const report = buildScoutingReport(
      ME,
      THEM,
      [],
      theirGames(SCOUT_MIN_SAMPLE)
    );
    expect(report.recentForm).not.toBeNull();
    expect(report.record?.played).toBe(SCOUT_MIN_SAMPLE);
  });

  it('borne la série de forme aux plus récentes', () => {
    const report = buildScoutingReport(ME, THEM, [], theirGames(12));
    expect(report.recentForm).toHaveLength(FORM_LENGTH);
    // La plus récente d'abord : le 12 juillet, index 11 → THEM perd (impair).
    expect(report.recentForm?.[0]).toBe('loss');
  });
});

describe('adversaires communs', () => {
  it('croise les bilans contre un tiers réellement partagé', () => {
    const myGames = [
      game({ team1Id: ME, team2Id: OTHER, winnerTeamId: ME }),
      game({ team1Id: ME, team2Id: OTHER, winnerTeamId: ME }),
    ];
    const theirGames = [
      game({ team1Id: THEM, team2Id: OTHER, winnerTeamId: OTHER }),
    ];
    const report = buildScoutingReport(ME, THEM, myGames, theirGames);
    expect(report.commonOpponents).toEqual([
      { teamId: OTHER, myWins: 2, myLosses: 0, theirWins: 0, theirLosses: 1 },
    ]);
  });

  it('n’inclut jamais la cible ni moi-même', () => {
    // « Vous avez battu vous-mêmes » n'est pas un renseignement.
    const myGames = [game({ winnerTeamId: ME })];
    const theirGames = [game({ winnerTeamId: ME })];
    const report = buildScoutingReport(ME, THEM, myGames, theirGames);
    expect(report.commonOpponents).toEqual([]);
  });

  it('ignore un tiers que la cible n’a jamais joué', () => {
    const myGames = [game({ team2Id: OTHER, winnerTeamId: ME })];
    const theirGames = [
      game({ team1Id: THEM, team2Id: 'someone-else', winnerTeamId: THEM }),
    ];
    const report = buildScoutingReport(ME, THEM, myGames, theirGames);
    expect(report.commonOpponents).toEqual([]);
  });
});

describe('créneaux habituels', () => {
  it('agrège les heures RÉELLEMENT jouées, dans le fuseau demandé', () => {
    // Trois mercredis à 20 h UTC ; avec +120 min, on doit lire 22 h.
    const theirGames = [1, 8, 15].map((day) =>
      game({
        team1Id: THEM,
        team2Id: OTHER,
        winnerTeamId: THEM,
        playedAt: `2026-07-${String(day).padStart(2, '0')}T20:00:00.000Z`,
      })
    );
    const report = buildScoutingReport(ME, THEM, [], theirGames, 120);
    expect(report.usualSlots?.[0]).toEqual({
      weekday: 3, // mercredi
      hour: 22,
      count: 3,
    });
  });

  it('ignore un affrontement sans date plutôt que de le ranger n’importe où', () => {
    const theirGames = [
      game({ team1Id: THEM, team2Id: OTHER, winnerTeamId: THEM }),
      game({ team1Id: THEM, team2Id: OTHER, winnerTeamId: THEM }),
      game({
        team1Id: THEM,
        team2Id: OTHER,
        winnerTeamId: THEM,
        playedAt: null,
      }),
    ];
    const report = buildScoutingReport(ME, THEM, [], theirGames);
    const total = (report.usualSlots ?? []).reduce((n, s) => n + s.count, 0);
    expect(total).toBe(2);
  });
});
