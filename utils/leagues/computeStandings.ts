// utils/leagues/computeStandings.ts
//
// Calcul PUR (aucune I/O) des standings d'une league a partir des placements
// par tournoi.
//
// Regles :
//  - Points d'un placement = (pointsTable[String(rank)] ?? 0) * weight du
//    tournoi correspondant.
//  - Somme des points par equipe sur tous les tournois lies.
//  - tournamentsCounted = nb de tournois ou l'equipe est classee.
//  - bestRank = min des rank de l'equipe (null si aucune ligne).
//  - Tri : points DESC, puis bestRank ASC, puis teamId ASC.
//  - rank assigne 1..n (pas de rangs partages : le tie-break les separe).
//  - Les rankings dont le tournamentId n'est pas dans `tournaments` sont ignores.

export type LeagueTournamentRef = { tournamentId: string; weight: number };
export type LeagueRankingRow = {
  tournamentId: string;
  teamId: string;
  rank: number;
};
export type LeagueStandingRow = {
  teamId: string;
  points: number;
  tournamentsCounted: number;
  bestRank: number | null;
  rank: number;
};

export function computeLeagueStandings(input: {
  tournaments: LeagueTournamentRef[];
  rankings: LeagueRankingRow[];
  pointsTable: Record<string, number>;
}): LeagueStandingRow[] {
  const { tournaments, rankings, pointsTable } = input;

  const weightByTournament = new Map<string, number>();
  for (const t of tournaments) weightByTournament.set(t.tournamentId, t.weight);

  type Agg = {
    points: number;
    tournamentsCounted: number;
    bestRank: number | null;
  };
  const agg = new Map<string, Agg>();

  for (const row of rankings) {
    const weight = weightByTournament.get(row.tournamentId);
    if (weight === undefined) continue; // tournoi non lie a la league

    const basePoints = pointsTable[String(row.rank)] ?? 0;
    const points = basePoints * weight;

    let e = agg.get(row.teamId);
    if (!e) {
      e = { points: 0, tournamentsCounted: 0, bestRank: null };
      agg.set(row.teamId, e);
    }
    e.points += points;
    e.tournamentsCounted += 1;
    if (e.bestRank === null || row.rank < e.bestRank) e.bestRank = row.rank;
  }

  const rows: LeagueStandingRow[] = [];
  agg.forEach((e, teamId) => {
    rows.push({
      teamId,
      points: e.points,
      tournamentsCounted: e.tournamentsCounted,
      bestRank: e.bestRank,
      rank: 0,
    });
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // bestRank ASC (null traite comme +Infinity, mais toute ligne agregee en a
    // toujours un ; garde-fou par securite).
    const ra = a.bestRank ?? Number.POSITIVE_INFINITY;
    const rb = b.bestRank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });

  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rows;
}
