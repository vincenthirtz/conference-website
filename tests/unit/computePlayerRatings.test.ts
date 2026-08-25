import { describe, it, expect } from 'vitest';
import {
  computePlayerRatings,
  applyMatchToStates,
  type RatingMatch,
  type RatingParticipant,
  type PlayerRatingState,
} from '../../utils/rating/computePlayerRatings';
import { DEFAULT_RATING, DEFAULT_RD } from '../../utils/rating/glicko2';

function match(overrides: Partial<RatingMatch> & { id: string }): RatingMatch {
  return {
    tournamentId: 't1',
    team1Id: 'A',
    team2Id: 'B',
    winnerTeamId: 'A',
    completedAt: '2026-01-01T00:00:00Z',
    status: 'finished',
    isBye: false,
    forfeitTeamId: null,
    ...overrides,
  };
}

function part(
  matchId: string,
  teamId: string,
  userId: string,
  isSubstitute = false
): RatingParticipant {
  return { matchId, teamId, userId, isSubstitute };
}

describe('computePlayerRatings — basic win/loss', () => {
  it('winner gains rating, loser loses rating', () => {
    const m = match({ id: 'm1', winnerTeamId: 'A' });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      ['m1', [part('m1', 'A', 'u1'), part('m1', 'B', 'u2')]],
    ]);
    const { ratings } = computePlayerRatings({
      matches: [m],
      participantsByMatch,
    });

    const winner = ratings.get('u1') as PlayerRatingState;
    const loser = ratings.get('u2') as PlayerRatingState;

    expect(winner.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(loser.rating).toBeLessThan(DEFAULT_RATING);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.losses).toBe(1);
    expect(winner.gamesPlayed).toBe(1);
    expect(winner.peakRating).toBe(winner.rating);
    expect(winner.lastMatchAt).toBe('2026-01-01T00:00:00Z');
  });
});

describe('computePlayerRatings — filtering', () => {
  it('ignores non-finished, bye, and null-winner matches', () => {
    const matches: RatingMatch[] = [
      match({ id: 'ongoing', status: 'in_progress' }),
      match({ id: 'bye', isBye: true }),
      match({ id: 'nowinner', winnerTeamId: null }),
      match({ id: 'noteam', team1Id: null }),
    ];
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      ['ongoing', [part('ongoing', 'A', 'u1'), part('ongoing', 'B', 'u2')]],
      ['bye', [part('bye', 'A', 'u1'), part('bye', 'B', 'u2')]],
      ['nowinner', [part('nowinner', 'A', 'u1'), part('nowinner', 'B', 'u2')]],
      ['noteam', [part('noteam', 'A', 'u1'), part('noteam', 'B', 'u2')]],
    ]);
    const { ratings, history } = computePlayerRatings({
      matches,
      participantsByMatch,
    });
    expect(history).toHaveLength(0);
    expect(ratings.size).toBe(0);
  });

  it('accepts walkover status', () => {
    const m = match({ id: 'wo', status: 'walkover', winnerTeamId: 'A' });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      ['wo', [part('wo', 'A', 'u1'), part('wo', 'B', 'u2')]],
    ]);
    const { history } = computePlayerRatings({
      matches: [m],
      participantsByMatch,
    });
    expect(history).toHaveLength(2);
  });

  it('skips a match when a side has no scored (non-substitute) participant', () => {
    const m = match({ id: 'm1', winnerTeamId: 'A' });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      // team B only has a substitute -> no scored participant on that side.
      ['m1', [part('m1', 'A', 'u1'), part('m1', 'B', 'u2', true)]],
    ]);
    const { ratings, history } = computePlayerRatings({
      matches: [m],
      participantsByMatch,
    });
    expect(history).toHaveLength(0);
    expect(ratings.size).toBe(0);
  });

  it('excludes substitutes but scores the rest of the roster', () => {
    const m = match({ id: 'm1', winnerTeamId: 'A' });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      [
        'm1',
        [
          part('m1', 'A', 'u1'),
          part('m1', 'A', 'sub', true),
          part('m1', 'B', 'u2'),
        ],
      ],
    ]);
    const { ratings } = computePlayerRatings({
      matches: [m],
      participantsByMatch,
    });
    expect(ratings.has('u1')).toBe(true);
    expect(ratings.has('u2')).toBe(true);
    expect(ratings.has('sub')).toBe(false);
  });
});

describe('computePlayerRatings — chronological replay', () => {
  it('processes matches in completedAt ASC order regardless of input order', () => {
    // Input order is reversed vs chronological.
    const later = match({
      id: 'm2',
      completedAt: '2026-02-01T00:00:00Z',
      winnerTeamId: 'A',
    });
    const earlier = match({
      id: 'm1',
      completedAt: '2026-01-01T00:00:00Z',
      winnerTeamId: 'A',
    });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      ['m1', [part('m1', 'A', 'u1'), part('m1', 'B', 'u2')]],
      // Same u1 plays again in m2, this time vs a fresh u3.
      ['m2', [part('m2', 'A', 'u1'), part('m2', 'B', 'u3')]],
    ]);

    const { history } = computePlayerRatings({
      matches: [later, earlier],
      participantsByMatch,
    });

    // History for u1 is ordered m1 then m2.
    const u1Rows = history.filter((r) => r.userId === 'u1');
    expect(u1Rows.map((r) => r.matchId)).toEqual(['m1', 'm2']);

    // The 2nd match's opponent (u3) is fresh at 1500, so opponentAvgRating = 1500.
    expect(u1Rows[1].opponentAvgRating).toBe(1500);

    // u1's rating at the start of m2 equals its rating after m1 (chained state).
    expect(u1Rows[1].ratingBefore).toBeCloseTo(u1Rows[0].ratingAfter, 10);
    // And it is above 1500 (won m1), reflecting post-m1 state.
    expect(u1Rows[1].ratingBefore).toBeGreaterThan(1500);
  });
});

describe('computePlayerRatings — history coherence', () => {
  it('emits consistent before/after, result and occurredAt fields', () => {
    const m = match({
      id: 'm1',
      tournamentId: 'tourX',
      winnerTeamId: 'B',
      completedAt: '2026-03-03T12:00:00Z',
    });
    const participantsByMatch = new Map<string, RatingParticipant[]>([
      ['m1', [part('m1', 'A', 'u1'), part('m1', 'B', 'u2')]],
    ]);
    const { ratings, history } = computePlayerRatings({
      matches: [m],
      participantsByMatch,
    });

    const rowU1 = history.find((r) => r.userId === 'u1');
    const rowU2 = history.find((r) => r.userId === 'u2');
    expect(rowU1).toBeDefined();
    expect(rowU2).toBeDefined();

    if (!rowU1 || !rowU2) throw new Error('missing history rows');

    expect(rowU1.result).toBe('loss');
    expect(rowU2.result).toBe('win');
    expect(rowU1.tournamentId).toBe('tourX');
    expect(rowU1.occurredAt).toBe('2026-03-03T12:00:00Z');
    expect(rowU1.ratingBefore).toBe(DEFAULT_RATING);
    expect(rowU1.rdBefore).toBe(DEFAULT_RD);
    expect(rowU1.opponentAvgRating).toBe(DEFAULT_RATING);

    // after fields match the final state.
    const finalU1 = ratings.get('u1') as PlayerRatingState;
    expect(rowU1.ratingAfter).toBe(finalU1.rating);
    expect(rowU1.rdAfter).toBe(finalU1.rd);
    expect(rowU1.volatilityAfter).toBe(finalU1.volatility);
  });
});

describe('applyMatchToStates', () => {
  it('produces the same result as a single-match computePlayerRatings', () => {
    const m = match({ id: 'm1', winnerTeamId: 'A' });
    const participants = [part('m1', 'A', 'u1'), part('m1', 'B', 'u2')];

    // Via applyMatchToStates.
    const states = new Map<string, PlayerRatingState>();
    const rows = applyMatchToStates(states, m, participants);

    // Via full replay.
    const { ratings, history } = computePlayerRatings({
      matches: [m],
      participantsByMatch: new Map([['m1', participants]]),
    });

    const s1 = states.get('u1') as PlayerRatingState;
    const r1 = ratings.get('u1') as PlayerRatingState;
    expect(s1.rating).toBeCloseTo(r1.rating, 10);
    expect(s1.rd).toBeCloseTo(r1.rd, 10);
    expect(s1.volatility).toBeCloseTo(r1.volatility, 10);

    expect(rows).toHaveLength(history.length);
    const rowU1 = rows.find((r) => r.userId === 'u1');
    const histU1 = history.find((r) => r.userId === 'u1');
    expect(rowU1?.ratingAfter).toBeCloseTo(histU1?.ratingAfter ?? -1, 10);
  });

  it('returns [] and mutates nothing for an unscorable match', () => {
    const m = match({ id: 'm1', status: 'in_progress' });
    const states = new Map<string, PlayerRatingState>();
    const rows = applyMatchToStates(states, m, [
      part('m1', 'A', 'u1'),
      part('m1', 'B', 'u2'),
    ]);
    expect(rows).toEqual([]);
    expect(states.size).toBe(0);
  });
});

describe('computePlayerRatings — scrims', () => {
  it('un scrim fait gagner moins de points qu’un match de compétition', () => {
    const parts = new Map<string, RatingParticipant[]>([
      ['m1', [part('m1', 'A', 'u1'), part('m1', 'B', 'u2')]],
    ]);

    const officiel = computePlayerRatings({
      matches: [match({ id: 'm1', winnerTeamId: 'A' })],
      participantsByMatch: parts,
    }).ratings.get('u1') as PlayerRatingState;

    const scrim = computePlayerRatings({
      matches: [
        match({
          id: 'm1',
          winnerTeamId: 'A',
          tournamentId: null,
          scrimId: 's1',
        }),
      ],
      participantsByMatch: parts,
    }).ratings.get('u1') as PlayerRatingState;

    expect(scrim.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(scrim.rating).toBeLessThan(officiel.rating);
    // Le gain du scrim est exactement la moitié de celui du match officiel.
    expect(scrim.rating - DEFAULT_RATING).toBeCloseTo(
      (officiel.rating - DEFAULT_RATING) / 2,
      10
    );
    // Il informe aussi moitié moins : le RD descend deux fois moins.
    expect(DEFAULT_RD - scrim.rd).toBeCloseTo(
      (DEFAULT_RD - officiel.rd) / 2,
      10
    );
    // La partie reste comptée comme jouée.
    expect(scrim.gamesPlayed).toBe(1);
    expect(scrim.wins).toBe(1);
  });

  it('un scrim contre une équipe sans joueuses en base note quand même le camp inscrit', () => {
    const m = match({
      id: 'm1',
      winnerTeamId: 'A',
      tournamentId: null,
      scrimId: 's1',
    });
    // Seul le camp A a des participantes : B est un sparring externe.
    const { ratings, history } = computePlayerRatings({
      matches: [m],
      participantsByMatch: new Map([['m1', [part('m1', 'A', 'u1')]]]),
    });

    const winner = ratings.get('u1') as PlayerRatingState;
    expect(winner.rating).toBeGreaterThan(DEFAULT_RATING);
    // L'adversaire par défaut vaut 1500 : c'est ce que porte l'historique.
    expect(history).toHaveLength(1);
    expect(history[0].opponentAvgRating).toBe(DEFAULT_RATING);
    // Aucune joueuse fantôme n'est créée côté adverse.
    expect(ratings.size).toBe(1);
  });

  it('un match de COMPÉTITION sans participantes d’un côté reste ignoré', () => {
    const m = match({ id: 'm1', winnerTeamId: 'A' });
    const { ratings, history } = computePlayerRatings({
      matches: [m],
      participantsByMatch: new Map([['m1', [part('m1', 'A', 'u1')]]]),
    });
    expect(ratings.size).toBe(0);
    expect(history).toEqual([]);
  });

  it('un scrim sans aucune participante des deux côtés ne note rien', () => {
    const m = match({
      id: 'm1',
      winnerTeamId: 'A',
      tournamentId: null,
      scrimId: 's1',
    });
    const states = new Map<string, PlayerRatingState>();
    expect(applyMatchToStates(states, m, [])).toEqual([]);
    expect(states.size).toBe(0);
  });
});
