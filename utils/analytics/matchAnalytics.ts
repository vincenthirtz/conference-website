// utils/analytics/matchAnalytics.ts
//
// Reducteur PUR (aucune I/O, testable) qui reconstruit la vue analytique d'un
// SEUL match : sequence de veto, drafts par game, score de maps agrege.
//
// Reutilise les types d'entree de tournamentAnalytics pour rester coherent.

import type {
  AnalyticsGame,
  AnalyticsVeto,
  AnalyticsDraftStep,
  AnalyticsHeroRef,
} from './tournamentAnalytics';

export type { AnalyticsGame, AnalyticsVeto, AnalyticsDraftStep };

export type MatchAnalyticsInput = {
  team1Id: string | null;
  team2Id: string | null;
  games: AnalyticsGame[];
  vetos: AnalyticsVeto[];
  draftSteps: AnalyticsDraftStep[];
  heroesById: Map<string, AnalyticsHeroRef>;
};

export type MatchAnalyticsGame = {
  mapOrder: number | null;
  mapName: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
  durationMinutes: number | null;
  isTiebreaker: boolean;
  wentOvertime: boolean;
};

export type MatchAnalyticsVetoStep = {
  step: number;
  action: 'ban' | 'pick' | 'decider';
  mapName: string;
  teamId: string | null;
};

export type MatchAnalyticsDraftStep = {
  action: 'ban' | 'pick';
  side: 'team1' | 'team2';
  heroId: string | null;
  heroName: string | null;
};

export type MatchAnalyticsDraft = {
  gameIndex: number;
  steps: MatchAnalyticsDraftStep[];
};

export type MatchAnalytics = {
  games: MatchAnalyticsGame[];
  vetoSequence: MatchAnalyticsVetoStep[];
  draft: MatchAnalyticsDraft[];
  mapScore: { team1: number; team2: number };
};

function gameWinnerTeamId(
  g: AnalyticsGame,
  team1Id: string | null,
  team2Id: string | null
): string | null {
  if (g.winner_team_id) return g.winner_team_id;
  const s1 = g.team1_score ?? 0;
  const s2 = g.team2_score ?? 0;
  if (s1 > s2) return team1Id;
  if (s2 > s1) return team2Id;
  return null;
}

export function computeMatchAnalytics(
  input: MatchAnalyticsInput
): MatchAnalytics {
  const { team1Id, team2Id, games, vetos, draftSteps, heroesById } = input;

  // Games triees par map_order.
  const sortedGames = [...games].sort(
    (a, b) => (a.map_order ?? 0) - (b.map_order ?? 0)
  );

  const outGames: MatchAnalyticsGame[] = sortedGames.map((g) => ({
    mapOrder: g.map_order,
    mapName: g.map_name,
    team1Score: g.team1_score,
    team2Score: g.team2_score,
    winnerTeamId: gameWinnerTeamId(g, team1Id, team2Id),
    durationMinutes: g.duration_minutes,
    isTiebreaker: Boolean(g.is_tiebreaker),
    wentOvertime: Boolean(g.went_overtime),
  }));

  // Score de maps agrege (nombre de games gagnees par chaque equipe).
  let team1MapWins = 0;
  let team2MapWins = 0;
  for (const g of outGames) {
    if (g.winnerTeamId && g.winnerTeamId === team1Id) team1MapWins += 1;
    else if (g.winnerTeamId && g.winnerTeamId === team2Id) team2MapWins += 1;
  }

  // Sequence de veto triee par step_number.
  const vetoSequence: MatchAnalyticsVetoStep[] = [...vetos]
    .sort((a, b) => a.step_number - b.step_number)
    .map((v) => ({
      step: v.step_number,
      action: v.action,
      mapName: v.map_name,
      teamId: v.team_id,
    }));

  // Drafts groupes par game_index, chaque groupe ordonne par ordre d'insertion.
  const draftByGame = new Map<number, MatchAnalyticsDraftStep[]>();
  for (const s of draftSteps) {
    const arr = draftByGame.get(s.game_index) ?? [];
    arr.push({
      action: s.action,
      side: s.side,
      heroId: s.hero_id,
      heroName: s.hero_id ? (heroesById.get(s.hero_id)?.name ?? null) : null,
    });
    draftByGame.set(s.game_index, arr);
  }
  const draft: MatchAnalyticsDraft[] = [...draftByGame.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gameIndex, steps]) => ({ gameIndex, steps }));

  return {
    games: outGames,
    vetoSequence,
    draft,
    mapScore: { team1: team1MapWins, team2: team2MapWins },
  };
}
