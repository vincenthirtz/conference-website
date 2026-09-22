// Unit tests — tableau staff des votes MVP (utils/mvp/voteBoard.ts).

import { describe, it, expect } from 'vitest';
import {
  buildVoteBoard,
  pollState,
  type VoteBoardMatchInput,
  type VoteBoardPollInput,
} from '../../utils/mvp/voteBoard';
import type { MvpVote } from '../../utils/mvp/awards';

const NOW = new Date('2026-09-22T12:00:00Z');

function match(id: string, scheduledAt: string): VoteBoardMatchInput {
  return {
    id,
    roundName: 'J1',
    scheduledAt,
    status: 'finished',
    team1Name: 'Alpha',
    team2Name: 'Bravo',
  };
}

function poll(overrides: Partial<VoteBoardPollInput> = {}): VoteBoardPollInput {
  return {
    postedAt: '2026-09-21T20:00:00Z',
    closesAt: '2026-09-23T20:00:00Z',
    closedAt: null,
    winnerMemberId: null,
    winnerSource: null,
    winnerVotes: null,
    totalVotes: null,
    ...overrides,
  };
}

const vote = (
  memberId: string,
  source: MvpVote['source'],
  voterKey: string
): MvpVote => ({ memberId, source, voterKey });

const members = new Map([
  ['ana', { label: 'Ana', teamName: 'Alpha' }],
  ['bea', { label: 'Béa', teamName: 'Bravo' }],
]);

describe('pollState', () => {
  it('distingue aucun vote, ouvert, fenêtre passée et dépouillé', () => {
    expect(pollState(null, NOW)).toBe('none');
    expect(pollState(poll({ postedAt: null }), NOW)).toBe('none');
    expect(pollState(poll(), NOW)).toBe('open');
    expect(pollState(poll({ closesAt: '2026-09-22T11:00:00Z' }), NOW)).toBe(
      'expired'
    );
    expect(pollState(poll({ closedAt: '2026-09-22T10:00:00Z' }), NOW)).toBe(
      'closed'
    );
  });
});

describe('buildVoteBoard', () => {
  it('compte par plateforme et dit qui mène selon la règle du dépouillement', () => {
    const board = buildVoteBoard({
      matches: [match('m1', '2026-09-21T19:00:00Z')],
      polls: new Map([['m1', poll()]]),
      votes: new Map([
        [
          'm1',
          [
            vote('ana', 'twitch', 't1'),
            vote('ana', 'twitch', 't2'),
            vote('bea', 'twitch', 't3'),
            vote('bea', 'discord', 'd1'),
          ],
        ],
      ]),
      members,
      now: NOW,
    });
    const m = board.matches[0];
    expect(m.state).toBe('open');
    expect(m.totalVotes).toBe(4);
    expect(m.sources.map((s) => [s.source, s.total])).toEqual([
      ['twitch', 3],
      ['discord', 1],
    ]);
    expect(m.sources[0].rows[0]).toMatchObject({
      label: 'Ana',
      teamName: 'Alpha',
      votes: 2,
    });
    // Twitch prime quand il a des voix : Ana mène 2 contre 1.
    expect(m.leader).toMatchObject({ memberId: 'ana', votes: 2, total: 3 });
  });

  it('dit pourquoi personne ne mène (trop peu de voix, égalité)', () => {
    const board = buildVoteBoard({
      matches: [
        match('few', '2026-09-21T19:00:00Z'),
        match('tie', '2026-09-21T18:00:00Z'),
      ],
      polls: new Map([
        ['few', poll()],
        ['tie', poll()],
      ]),
      votes: new Map([
        ['few', [vote('ana', 'discord', 'd1')]],
        [
          'tie',
          [
            vote('ana', 'discord', 'd1'),
            vote('ana', 'discord', 'd2'),
            vote('bea', 'discord', 'd3'),
            vote('bea', 'discord', 'd4'),
          ],
        ],
      ]),
      members,
      now: NOW,
    });
    const byId = new Map(board.matches.map((m) => [m.id, m]));
    expect(byId.get('few')?.leader).toEqual({
      memberId: null,
      reason: 'too_few_votes',
    });
    expect(byId.get('tie')?.leader).toEqual({ memberId: null, reason: 'tie' });
  });

  it("ignore les matchs sans vote ouvert ni voix, et trie ce qui bouge d'abord", () => {
    const board = buildVoteBoard({
      matches: [
        match('closed', '2026-09-21T21:00:00Z'),
        match('silent', '2026-09-21T22:00:00Z'),
        match('open', '2026-09-20T19:00:00Z'),
      ],
      polls: new Map([
        [
          'closed',
          poll({
            closedAt: '2026-09-22T09:00:00Z',
            winnerMemberId: 'bea',
            winnerSource: 'twitch',
            winnerVotes: 5,
            totalVotes: 8,
          }),
        ],
        ['open', poll()],
      ]),
      votes: new Map(),
      members,
      now: NOW,
    });
    expect(board.matches.map((m) => m.id)).toEqual(['open', 'closed']);
    expect(board.matches[1].winner).toEqual({
      memberId: 'bea',
      label: 'Béa',
      source: 'twitch',
      votes: 5,
      total: 8,
    });
    expect(board.totals).toEqual({
      votes: 0,
      openPolls: 1,
      matchesWithVotes: 0,
    });
  });

  it("n'expose jamais les identifiants de votants", () => {
    const board = buildVoteBoard({
      matches: [match('m1', '2026-09-21T19:00:00Z')],
      polls: new Map([['m1', poll()]]),
      votes: new Map([['m1', [vote('ana', 'discord', 'secret-discord-id')]]]),
      members,
      now: NOW,
    });
    expect(JSON.stringify(board)).not.toContain('secret-discord-id');
  });
});
