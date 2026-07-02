// utils/analytics/tournamentAnalytics.ts
//
// Reducteur PUR (aucune I/O, testable) qui agrege les statistiques d'un
// tournoi a partir de rows brutes deja chargees par le handler API. Toute la
// logique de comptage/tri vit ici pour rester unit-testable sans DB.
//
// Regles cles :
//  - winRate est garde en fraction 0..1 (l'UI formate) ; division par zero -> 0.
//  - Un "map win" pour une equipe = une game ou son score depasse l'adverse.
//  - Appariement game <-> draft pour le win des heroes : voir HERO WIN PAIRING.

// ---------------------------------------------------------------------------
// Types d'entree (rows brutes minimales — sous-ensemble des colonnes DB).
// ---------------------------------------------------------------------------

export type AnalyticsMatch = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string | null;
  is_bye?: boolean | null;
};

export type AnalyticsGame = {
  match_id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  duration_minutes: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

export type AnalyticsVeto = {
  match_id: string;
  step_number: number;
  action: 'ban' | 'pick' | 'decider';
  team_id: string | null;
  map_name: string;
};

export type AnalyticsDraftStep = {
  match_id: string;
  game_index: number;
  action: 'ban' | 'pick';
  side: 'team1' | 'team2';
  hero_id: string | null;
  phase: string | null;
};

export type AnalyticsTeamRef = { id: string; name: string };
export type AnalyticsHeroRef = { id: string; name: string };

export type TournamentAnalyticsInput = {
  matches: AnalyticsMatch[];
  games: AnalyticsGame[];
  vetos: AnalyticsVeto[];
  draftSteps: AnalyticsDraftStep[];
  heroesById: Map<string, AnalyticsHeroRef>;
  teamsById: Map<string, AnalyticsTeamRef>;
};

// ---------------------------------------------------------------------------
// Types de sortie.
// ---------------------------------------------------------------------------

export type TournamentAnalyticsSummary = {
  totalMatches: number;
  finishedMatches: number;
  totalGames: number;
  avgGameDurationMin: number;
  overtimeRate: number;
  // Part des games décisifs (flaggés is_tiebreaker) sur le total des games.
  // NB: ce n'est PAS le % de matches allés jusqu'au dernier game.
  tiebreakerGameRate: number;
};

export type TournamentAnalyticsTeam = {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  mapWins: number;
  mapLosses: number;
};

export type TournamentAnalyticsMap = {
  mapName: string;
  picks: number;
  bans: number;
  gamesPlayed: number;
  avgDurationMin: number;
  overtimeRate: number;
};

export type TournamentAnalyticsHero = {
  heroId: string;
  name: string;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type TournamentAnalytics = {
  summary: TournamentAnalyticsSummary;
  teams: TournamentAnalyticsTeam[];
  maps: TournamentAnalyticsMap[];
  heroes: TournamentAnalyticsHero[];
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Division sure : renvoie 0 si le denominateur est nul/negatif. */
function safeRate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

/**
 * Determine l'equipe gagnante d'une game. Priorite a games.winner_team_id ;
 * sinon deduit du score si l'un des deux domine.
 */
function gameWinnerTeamId(
  g: AnalyticsGame,
  match: AnalyticsMatch | undefined
): string | null {
  if (g.winner_team_id) return g.winner_team_id;
  if (!match) return null;
  const s1 = g.team1_score ?? 0;
  const s2 = g.team2_score ?? 0;
  if (s1 > s2) return match.team1_id;
  if (s2 > s1) return match.team2_id;
  return null;
}

// ---------------------------------------------------------------------------
// Reducteur principal.
// ---------------------------------------------------------------------------

export function computeTournamentAnalytics(
  input: TournamentAnalyticsInput
): TournamentAnalytics {
  const { matches, games, vetos, draftSteps, heroesById, teamsById } = input;

  // On ignore les byes pour tous les comptages "joues".
  const realMatches = matches.filter((m) => !m.is_bye);
  const finishedMatches = realMatches.filter((m) => m.status === 'finished');
  const matchById = new Map<string, AnalyticsMatch>();
  realMatches.forEach((m) => matchById.set(m.id, m));

  // --- Summary ---------------------------------------------------------------
  const totalGames = games.length;
  const durations = games
    .map((g) => g.duration_minutes)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  const avgGameDurationMin = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const overtimeGames = games.filter((g) => g.went_overtime).length;
  const tiebreakerGames = games.filter((g) => g.is_tiebreaker).length;

  const summary: TournamentAnalyticsSummary = {
    totalMatches: realMatches.length,
    finishedMatches: finishedMatches.length,
    totalGames,
    avgGameDurationMin,
    overtimeRate: safeRate(overtimeGames, totalGames),
    tiebreakerGameRate: safeRate(tiebreakerGames, totalGames),
  };

  // --- Teams -----------------------------------------------------------------
  type TeamAgg = {
    wins: number;
    losses: number;
    mapWins: number;
    mapLosses: number;
  };
  const teamAgg = new Map<string, TeamAgg>();
  const ensureTeam = (id: string): TeamAgg => {
    let e = teamAgg.get(id);
    if (!e) {
      e = { wins: 0, losses: 0, mapWins: 0, mapLosses: 0 };
      teamAgg.set(id, e);
    }
    return e;
  };

  // Wins / losses au niveau match (matches finis avec un vainqueur).
  for (const m of finishedMatches) {
    if (!m.winner_team_id) continue;
    const winnerId = m.winner_team_id;
    const loserId = m.team1_id === winnerId ? m.team2_id : m.team1_id;
    ensureTeam(winnerId).wins += 1;
    if (loserId) ensureTeam(loserId).losses += 1;
  }

  // Map wins / losses au niveau game.
  for (const g of games) {
    const match = matchById.get(g.match_id);
    if (!match || !match.team1_id || !match.team2_id) continue;
    const winner = gameWinnerTeamId(g, match);
    if (!winner) continue;
    const loser = winner === match.team1_id ? match.team2_id : match.team1_id;
    ensureTeam(winner).mapWins += 1;
    if (loser) ensureTeam(loser).mapLosses += 1;
  }

  const teams: TournamentAnalyticsTeam[] = [];
  teamAgg.forEach((agg, teamId) => {
    const played = agg.wins + agg.losses;
    teams.push({
      teamId,
      name: teamsById.get(teamId)?.name ?? teamId,
      played,
      wins: agg.wins,
      losses: agg.losses,
      winRate: safeRate(agg.wins, played),
      mapWins: agg.mapWins,
      mapLosses: agg.mapLosses,
    });
  });
  // Tri : winRate desc, puis wins desc.
  teams.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  });

  // --- Maps ------------------------------------------------------------------
  type MapAgg = {
    picks: number;
    bans: number;
    gamesPlayed: number;
    durationSum: number;
    durationCount: number;
    overtimes: number;
  };
  const mapAgg = new Map<string, MapAgg>();
  const ensureMap = (name: string): MapAgg => {
    let e = mapAgg.get(name);
    if (!e) {
      e = {
        picks: 0,
        bans: 0,
        gamesPlayed: 0,
        durationSum: 0,
        durationCount: 0,
        overtimes: 0,
      };
      mapAgg.set(name, e);
    }
    return e;
  };

  for (const v of vetos) {
    if (!v.map_name) continue;
    const e = ensureMap(v.map_name);
    // decider compte comme un pick (map jouee, choisie par le systeme).
    if (v.action === 'ban') e.bans += 1;
    else e.picks += 1;
  }
  for (const g of games) {
    if (!g.map_name) continue;
    const e = ensureMap(g.map_name);
    e.gamesPlayed += 1;
    if (typeof g.duration_minutes === 'number' && g.duration_minutes > 0) {
      e.durationSum += g.duration_minutes;
      e.durationCount += 1;
    }
    if (g.went_overtime) e.overtimes += 1;
  }

  const maps: TournamentAnalyticsMap[] = [];
  mapAgg.forEach((agg, mapName) => {
    maps.push({
      mapName,
      picks: agg.picks,
      bans: agg.bans,
      gamesPlayed: agg.gamesPlayed,
      avgDurationMin: safeRate(agg.durationSum, agg.durationCount),
      overtimeRate: safeRate(agg.overtimes, agg.gamesPlayed),
    });
  });
  // Tri : gamesPlayed desc.
  maps.sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  // --- Heroes ----------------------------------------------------------------
  // HERO WIN PAIRING :
  //   Un pick de hero est "gagnant" si le side (team1/team2) qui l'a pick a
  //   gagne la game correspondante. On apparie draftStep -> game via
  //   (match_id, game_index). L'appariement est :
  //     game_index (1-based cote draft) <-> games.map_order + 1
  //     avec fallback sur game_index direct si aucune game map_order+1 ne matche.
  //   Le win n'est compte QUE lorsque l'appariement est certain (une game
  //   unique trouvee ET un vainqueur determinable). picks/bans sont toujours
  //   comptes de facon fiable, independamment de l'appariement.
  const heroAgg = new Map<
    string,
    { picks: number; bans: number; wins: number; losses: number }
  >();
  const ensureHero = (id: string) => {
    let e = heroAgg.get(id);
    if (!e) {
      e = { picks: 0, bans: 0, wins: 0, losses: 0 };
      heroAgg.set(id, e);
    }
    return e;
  };

  // Index des games par (match_id, map_order) et par match pour appariement.
  const gamesByMatch = new Map<string, AnalyticsGame[]>();
  for (const g of games) {
    const arr = gamesByMatch.get(g.match_id) ?? [];
    arr.push(g);
    gamesByMatch.set(g.match_id, arr);
  }

  /** Trouve la game correspondant a (match, gameIndex 1-based), ou null si ambigu. */
  function resolveGame(
    matchId: string,
    gameIndex: number
  ): AnalyticsGame | null {
    const arr = gamesByMatch.get(matchId);
    if (!arr || arr.length === 0) return null;
    // Priorite : map_order + 1 === gameIndex.
    const byOrder = arr.filter(
      (g) => typeof g.map_order === 'number' && g.map_order + 1 === gameIndex
    );
    if (byOrder.length === 1) return byOrder[0];
    if (byOrder.length > 1) return null; // ambigu
    // Fallback : indexation positionnelle triee par map_order.
    const sorted = [...arr].sort(
      (a, b) => (a.map_order ?? 0) - (b.map_order ?? 0)
    );
    const candidate = sorted[gameIndex - 1];
    return candidate ?? null;
  }

  for (const step of draftSteps) {
    if (!step.hero_id) continue;
    const e = ensureHero(step.hero_id);
    if (step.action === 'ban') {
      e.bans += 1;
      continue;
    }
    // action === 'pick'
    e.picks += 1;
    const match = matchById.get(step.match_id);
    const game = resolveGame(step.match_id, step.game_index);
    if (!match || !game) continue; // appariement incertain -> pas de win/loss
    const winnerTeam = gameWinnerTeamId(game, match);
    if (!winnerTeam) continue;
    const pickSideTeamId =
      step.side === 'team1' ? match.team1_id : match.team2_id;
    if (!pickSideTeamId) continue;
    if (pickSideTeamId === winnerTeam) e.wins += 1;
    else e.losses += 1;
  }

  const heroes: TournamentAnalyticsHero[] = [];
  heroAgg.forEach((agg, heroId) => {
    heroes.push({
      heroId,
      name: heroesById.get(heroId)?.name ?? heroId,
      picks: agg.picks,
      bans: agg.bans,
      wins: agg.wins,
      losses: agg.losses,
      winRate: safeRate(agg.wins, agg.wins + agg.losses),
    });
  });
  // Tri : (picks + bans) desc.
  heroes.sort((a, b) => b.picks + b.bans - (a.picks + a.bans));

  return { summary, teams, maps, heroes };
}
