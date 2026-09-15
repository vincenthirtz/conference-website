// Tier list et duels d'un tournoi.
// Target: utils/analytics/teamTiers.ts
//
// CE QUE CES CAS PROTÈGENT :
//   1. LES SEUILS SONT ABSOLUS, pas relatifs : un plateau serré peut n'avoir
//      AUCUNE équipe en S. Un classement par percentiles en fabriquerait une,
//      et dirait une chose fausse du tournoi.
//   2. UNE ÉQUIPE QUI N'A PAS JOUÉ N'EST PAS CLASSÉE — un forfait au premier
//      tour ne fait pas une équipe « C ».
//   3. UNE MESURE MANQUANTE N'EST PAS UNE MAUVAISE MESURE : sans manches
//      connues, la part de manches vaut 0,5, elle ne pénalise pas.
//   4. LES DUELS NE RECENSENT QUE LES RENCONTRES RÉELLES, et se lisent dans
//      les deux sens sans jamais inverser les scores.

import { describe, expect, it } from 'vitest';

import {
  MIN_PLAYED_FOR_TIER,
  computeTeamDuels,
  computeTeamTiers,
  duelBetween,
} from '../../utils/analytics/teamTiers';
import type { TournamentAnalyticsTeam } from '../../utils/analytics/tournamentAnalytics';

const TEAM_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TEAM_C = 'cccccccc-0000-4000-8000-000000000003';

function team(
  over: Partial<TournamentAnalyticsTeam> & { teamId: string; name: string }
): TournamentAnalyticsTeam {
  return {
    played: 4,
    wins: 2,
    losses: 2,
    winRate: 0.5,
    mapWins: 4,
    mapLosses: 4,
    ...over,
  };
}

describe('computeTeamTiers', () => {
  it('classe une équipe dominante en S, une équipe médiane plus bas', () => {
    const { tiers } = computeTeamTiers([
      team({
        teamId: TEAM_A,
        name: 'Alpha',
        played: 5,
        wins: 5,
        losses: 0,
        winRate: 1,
        mapWins: 10,
        mapLosses: 2,
      }),
      team({ teamId: TEAM_B, name: 'Bravo' }),
    ]);
    const byLabel = Object.fromEntries(
      tiers.map((tier) => [tier.label, tier.teams.map((t) => t.name)])
    );
    expect(byLabel.S).toEqual(['Alpha']);
    expect(byLabel.S).not.toContain('Bravo');
  });

  it('ne fabrique pas de tier S dans un plateau serré', () => {
    // Trois équipes à 50 % : la meilleure n'est pas « S », elle est comme les
    // autres. C'est exactement ce qu'un classement par percentiles raterait.
    const { tiers } = computeTeamTiers([
      team({ teamId: TEAM_A, name: 'Alpha' }),
      team({ teamId: TEAM_B, name: 'Bravo' }),
      team({ teamId: TEAM_C, name: 'Charlie' }),
    ]);
    expect(tiers.some((tier) => tier.label === 'S')).toBe(false);
  });

  it('laisse hors classement une équipe qui a trop peu joué', () => {
    const { tiers, unranked, minPlayed } = computeTeamTiers([
      team({
        teamId: TEAM_A,
        name: 'Alpha',
        played: 1,
        wins: 0,
        losses: 1,
        winRate: 0,
        mapWins: 0,
        mapLosses: 2,
      }),
      team({ teamId: TEAM_B, name: 'Bravo' }),
    ]);
    expect(minPlayed).toBe(MIN_PLAYED_FOR_TIER);
    expect(unranked.map((t) => t.name)).toEqual(['Alpha']);
    expect(tiers.flatMap((tier) => tier.teams.map((t) => t.name))).toEqual([
      'Bravo',
    ]);
  });

  it('reste neutre quand aucune manche n’est connue', () => {
    const { tiers } = computeTeamTiers([
      team({
        teamId: TEAM_A,
        name: 'Alpha',
        wins: 4,
        losses: 0,
        played: 4,
        winRate: 1,
        mapWins: 0,
        mapLosses: 0,
      }),
    ]);
    const alpha = tiers.flatMap((tier) => tier.teams)[0];
    expect(alpha.mapRate).toBe(0.5);
    // 0,65 × 1 + 0,35 × 0,5 = 0,825 → toujours S, sans manche connue.
    expect(alpha.tier).toBe('S');
  });
});

describe('computeTeamDuels', () => {
  const matches = [
    {
      id: 'm1',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      winner_team_id: TEAM_A,
      status: 'finished',
    },
    {
      id: 'm2',
      team1_id: TEAM_B,
      team2_id: TEAM_A,
      winner_team_id: TEAM_B,
      status: 'finished',
    },
    // Non terminé : ne compte pas.
    {
      id: 'm3',
      team1_id: TEAM_A,
      team2_id: TEAM_C,
      winner_team_id: null,
      status: 'pending',
    },
    // Bye : ne compte pas non plus.
    {
      id: 'm4',
      team1_id: TEAM_A,
      team2_id: TEAM_C,
      winner_team_id: TEAM_A,
      status: 'finished',
      is_bye: true,
    },
  ];
  const games = [
    {
      match_id: 'm1',
      map_name: 'Ilios',
      map_order: 1,
      team1_score: 2,
      team2_score: 0,
      winner_team_id: null,
      duration_minutes: 10,
      is_tiebreaker: false,
      went_overtime: false,
    },
    {
      // m2 : TEAM_B est `team1` et gagne le match — sa manche doit donc lui
      // revenir. (Une manche gagnée par l'autre camp que le vainqueur du match
      // était une fixture incohérente : le compteur avait raison, pas elle.)
      match_id: 'm2',
      map_name: 'Numbani',
      map_order: 1,
      team1_score: 1,
      team2_score: 0,
      winner_team_id: null,
      duration_minutes: 12,
      is_tiebreaker: false,
      went_overtime: false,
    },
  ];

  it('ne recense que les rencontres réellement jouées', () => {
    const duels = computeTeamDuels({ matches, games });
    expect(duels).toHaveLength(1);
    expect(duels[0].matches).toBe(2);
    expect(duels[0].aWins + duels[0].bWins).toBe(2);
  });

  it('se lit dans les deux sens sans inverser les scores', () => {
    const duels = computeTeamDuels({ matches, games });
    const ab = duelBetween(duels, TEAM_A, TEAM_B);
    const ba = duelBetween(duels, TEAM_B, TEAM_A);
    expect(ab).toEqual({
      matches: 2,
      aWins: 1,
      bWins: 1,
      aMapWins: 1,
      bMapWins: 1,
    });
    expect(ba?.aWins).toBe(ab?.bWins);
    expect(ba?.aMapWins).toBe(ab?.bMapWins);
  });

  it('rend null pour deux équipes qui ne se sont pas rencontrées', () => {
    const duels = computeTeamDuels({ matches, games });
    expect(duelBetween(duels, TEAM_A, TEAM_C)).toBeNull();
  });
});
