// utils/analytics/teamTiers.ts
//
// Tier list et duels d'un tournoi — réducteurs PURS (aucune I/O), dans la même
// discipline que `tournamentAnalytics.ts` dont ils consomment la sortie.
//
// POURQUOI DES SEUILS ABSOLUS, ET NON DES PERCENTILES. Un classement par
// percentiles fabrique toujours un tier S, même dans un plateau homogène : la
// meilleure de huit équipes à 50 % de victoires deviendrait « S ». Les seuils
// fixes disent quelque chose de vrai — « a gagné les trois quarts de ses
// matchs » — et laissent un tournoi serré sans tier S, ce qui est l'information
// juste.
//
// DEUX MESURES, PAS UNE. Les matchs gagnés disent l'issue, les manches gagnées
// disent la marge : une équipe qui gagne tout en 2-1 n'est pas une équipe qui
// gagne tout en 2-0, et un tournoi à élimination directe donne trop peu de
// matchs pour trancher sur le seul résultat.
//
// UNE ÉQUIPE QUI N'A PAS JOUÉ N'EST PAS CLASSÉE. En dessous de `minPlayed`,
// elle sort en `unranked` plutôt que d'hériter d'un tier tiré d'un seul match —
// un forfait au premier tour ne fait pas une équipe « C ».
//
// CE QUE ÇA N'EST PAS : un jugement public. Ces tiers servent l'organisation
// (équilibrer des poules, placer des têtes de série, préparer une diffusion) et
// vivent dans l'écran d'analyse du staff, pas sur la page publique du tournoi.

import type {
  AnalyticsGame,
  AnalyticsMatch,
  TournamentAnalyticsTeam,
} from './tournamentAnalytics';

export type TierLabel = 'S' | 'A' | 'B' | 'C';

export type TieredTeam = {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Manches gagnées / manches jouées. `0.5` quand aucune manche n'est connue. */
  mapRate: number;
  /** Note composite 0..1 qui décide du tier. */
  score: number;
  tier: TierLabel;
};

export type UnrankedTeam = Omit<TieredTeam, 'tier' | 'score'>;

export type TierList = {
  tiers: Array<{ label: TierLabel; teams: TieredTeam[] }>;
  /** Trop peu de matchs joués pour être classées. */
  unranked: UnrankedTeam[];
  minPlayed: number;
};

/** Matchs joués minimum pour être classée. */
export const MIN_PLAYED_FOR_TIER = 2;

/**
 * Poids des deux mesures. La victoire pèse davantage : c'est elle qui fait
 * avancer dans un bracket. La marge corrige, elle n'écrase pas.
 */
const WIN_WEIGHT = 0.65;
const MAP_WEIGHT = 0.35;

/** Seuils de tier, du plus haut au plus bas. Le premier atteint gagne. */
const TIER_THRESHOLDS: ReadonlyArray<{ label: TierLabel; min: number }> = [
  { label: 'S', min: 0.75 },
  { label: 'A', min: 0.6 },
  { label: 'B', min: 0.42 },
  { label: 'C', min: 0 },
];

function tierFor(score: number): TierLabel {
  return (
    TIER_THRESHOLDS.find((tier) => score >= tier.min)?.label ??
    ('C' as TierLabel)
  );
}

export function computeTeamTiers(
  teams: readonly TournamentAnalyticsTeam[],
  options: { minPlayed?: number } = {}
): TierList {
  const minPlayed = options.minPlayed ?? MIN_PLAYED_FOR_TIER;

  const unranked: UnrankedTeam[] = [];
  const scored: TieredTeam[] = [];

  for (const team of teams) {
    const maps = team.mapWins + team.mapLosses;
    // Aucune manche connue (import sans détail) : on ne pénalise pas, on reste
    // neutre — la mesure manque, elle n'est pas mauvaise.
    const mapRate = maps > 0 ? team.mapWins / maps : 0.5;
    const base = {
      teamId: team.teamId,
      name: team.name,
      played: team.played,
      wins: team.wins,
      losses: team.losses,
      winRate: team.winRate,
      mapRate,
    };
    if (team.played < minPlayed) {
      unranked.push(base);
      continue;
    }
    const score = WIN_WEIGHT * team.winRate + MAP_WEIGHT * mapRate;
    scored.push({ ...base, score, tier: tierFor(score) });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  unranked.sort((a, b) => a.name.localeCompare(b.name));

  const tiers = TIER_THRESHOLDS.map(({ label }) => ({
    label,
    teams: scored.filter((team) => team.tier === label),
  })).filter((tier) => tier.teams.length > 0);

  return { tiers, unranked, minPlayed };
}

/* ---------------------------------------------------------------------------
 * Duels : ce que deux équipes se sont fait
 * ------------------------------------------------------------------------- */

export type TeamDuel = {
  teamAId: string;
  teamBId: string;
  /** Matchs terminés entre elles. */
  matches: number;
  aWins: number;
  bWins: number;
  aMapWins: number;
  bMapWins: number;
};

/** Clé d'un duel, indépendante de l'ordre des deux équipes. */
function duelKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Les duels RÉELLEMENT joués, jamais toutes les paires possibles : un tableau
 * de n² cases vides ne dit rien et grossit avec le tournoi.
 */
export function computeTeamDuels(input: {
  matches: readonly AnalyticsMatch[];
  games: readonly AnalyticsGame[];
}): TeamDuel[] {
  const byKey = new Map<string, TeamDuel>();
  const matchById = new Map<string, AnalyticsMatch>();

  for (const match of input.matches) {
    if (match.is_bye) continue;
    if (!match.team1_id || !match.team2_id) continue;
    matchById.set(match.id, match);
    if (match.status !== 'finished') continue;

    const [teamAId, teamBId] =
      match.team1_id < match.team2_id
        ? [match.team1_id, match.team2_id]
        : [match.team2_id, match.team1_id];
    const key = duelKey(teamAId, teamBId);
    const duel = byKey.get(key) ?? {
      teamAId,
      teamBId,
      matches: 0,
      aWins: 0,
      bWins: 0,
      aMapWins: 0,
      bMapWins: 0,
    };
    duel.matches += 1;
    if (match.winner_team_id === teamAId) duel.aWins += 1;
    else if (match.winner_team_id === teamBId) duel.bWins += 1;
    byKey.set(key, duel);
  }

  for (const game of input.games) {
    const match = matchById.get(game.match_id);
    if (!match || match.status !== 'finished') continue;
    if (!match.team1_id || !match.team2_id) continue;
    const key = duelKey(match.team1_id, match.team2_id);
    const duel = byKey.get(key);
    if (!duel) continue;

    const winner =
      game.winner_team_id ??
      ((game.team1_score ?? 0) > (game.team2_score ?? 0)
        ? match.team1_id
        : (game.team2_score ?? 0) > (game.team1_score ?? 0)
          ? match.team2_id
          : null);
    if (!winner) continue;
    if (winner === duel.teamAId) duel.aMapWins += 1;
    else if (winner === duel.teamBId) duel.bMapWins += 1;
  }

  return [...byKey.values()].sort(
    (a, b) => b.matches - a.matches || a.teamAId.localeCompare(b.teamAId)
  );
}

/** Le duel entre deux équipes, dans l'ordre demandé. `null` si jamais jouées. */
export function duelBetween(
  duels: readonly TeamDuel[],
  teamAId: string,
  teamBId: string
): {
  matches: number;
  aWins: number;
  bWins: number;
  aMapWins: number;
  bMapWins: number;
} | null {
  const duel = duels.find(
    (d) =>
      (d.teamAId === teamAId && d.teamBId === teamBId) ||
      (d.teamAId === teamBId && d.teamBId === teamAId)
  );
  if (!duel) return null;
  const flipped = duel.teamAId !== teamAId;
  return {
    matches: duel.matches,
    aWins: flipped ? duel.bWins : duel.aWins,
    bWins: flipped ? duel.aWins : duel.bWins,
    aMapWins: flipped ? duel.bMapWins : duel.aMapWins,
    bMapWins: flipped ? duel.aMapWins : duel.bMapWins,
  };
}
