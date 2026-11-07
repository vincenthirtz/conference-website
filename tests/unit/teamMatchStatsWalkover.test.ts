import { describe, expect, it } from 'vitest';
import {
  computeMatchStats,
  type MatchStatsRow,
} from '@/utils/teams/buildTeamPage';

const US = 'team-us';
const THEM = 'team-them';

const row = (over: Partial<MatchStatsRow>): MatchStatsRow => ({
  id: Math.random().toString(36).slice(2),
  status: 'finished',
  team1_id: US,
  team2_id: THEM,
  team1_score: null,
  team2_score: null,
  winner_team_id: null,
  forfeit_team_id: null,
  ...over,
});

describe('computeMatchStats — forfaits comptés au bilan', () => {
  it('compte un forfait avec vainqueur posé comme victoire ou défaite', () => {
    const stats = computeMatchStats(
      [
        row({ status: 'walkover', winner_team_id: US }),
        row({ status: 'walkover', winner_team_id: THEM }),
      ],
      US
    );
    expect(stats).toMatchObject({ wins: 1, losses: 1, draws: 0 });
  });

  it("sans vainqueur, l'équipe déclarée forfait perd", () => {
    const stats = computeMatchStats(
      [
        row({
          status: 'walkover',
          forfeit_team_id: THEM,
          team1_score: 0,
          team2_score: 0,
        }),
        row({
          status: 'walkover',
          forfeit_team_id: US,
          team1_score: 0,
          team2_score: 0,
        }),
      ],
      US
    );
    expect(stats).toMatchObject({ wins: 1, losses: 1, draws: 0 });
  });

  it("un forfait sans vainqueur ni équipe forfait n'est pas un nul", () => {
    const stats = computeMatchStats(
      [row({ status: 'walkover', team1_score: 0, team2_score: 0 })],
      US
    );
    expect(stats).toMatchObject({ wins: 0, losses: 0, draws: 0 });
  });

  it('garde le repli par score pour les matchs joués', () => {
    const stats = computeMatchStats(
      [
        row({ team1_score: 3, team2_score: 1 }),
        row({ team1_score: 2, team2_score: 2 }),
      ],
      US
    );
    expect(stats).toMatchObject({ total: 2, wins: 1, losses: 0, draws: 1 });
  });
});
