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
//
// SCRIMS (2026-08-24) : une saison agrege aussi les scrims qui lui sont
// rattaches. Leur bareme est SEPARE de celui des tournois, et c'est
// delibere : `pointsTable` note un CLASSEMENT FINAL (100/75/50/25), une
// notion qui n'existe pas pour un scrim. On applique donc victoire/nul/
// defaite (3/1/0 par defaut, cf. DEFAULT_SCRIM_POINTS), soit un ordre de
// grandeur sous une place de tournoi — un entrainement ne doit pas peser
// autant qu'un podium.
//
// Un scrim ne touche NI a bestRank NI a tournamentsCounted : il n'a pas de
// rang, et le confondre avec un tournoi fausserait le departage.

export type LeagueTournamentRef = { tournamentId: string; weight: number };

/** Resultat d'un scrim rattache a la saison. `weight` module ses points. */
export type LeagueScrimResult = {
  scrimId: string;
  team1Id: string | null;
  team2Id: string | null;
  /** `null` = match nul : les deux camps prennent les points de nul. */
  winnerTeamId: string | null;
  weight: number;
};

/** Bareme d'un scrim en points de saison. */
export type ScrimPointsTable = { win: number; draw: number; loss: number };

export const DEFAULT_SCRIM_POINTS: ScrimPointsTable = {
  win: 3,
  draw: 1,
  loss: 0,
};
export type LeagueRankingRow = {
  tournamentId: string;
  teamId: string;
  rank: number;
};
export type LeagueStandingRow = {
  teamId: string;
  points: number;
  tournamentsCounted: number;
  scrimsCounted: number;
  bestRank: number | null;
  rank: number;
};

export function computeLeagueStandings(input: {
  tournaments: LeagueTournamentRef[];
  rankings: LeagueRankingRow[];
  pointsTable: Record<string, number>;
  scrims?: LeagueScrimResult[];
  scrimPoints?: ScrimPointsTable;
}): LeagueStandingRow[] {
  const {
    tournaments,
    rankings,
    pointsTable,
    scrims = [],
    scrimPoints = DEFAULT_SCRIM_POINTS,
  } = input;

  const weightByTournament = new Map<string, number>();
  for (const t of tournaments) weightByTournament.set(t.tournamentId, t.weight);

  type Agg = {
    points: number;
    tournamentsCounted: number;
    scrimsCounted: number;
    bestRank: number | null;
  };
  const agg = new Map<string, Agg>();
  const ensure = (teamId: string): Agg => {
    let e = agg.get(teamId);
    if (!e) {
      e = {
        points: 0,
        tournamentsCounted: 0,
        scrimsCounted: 0,
        bestRank: null,
      };
      agg.set(teamId, e);
    }
    return e;
  };

  for (const row of rankings) {
    const weight = weightByTournament.get(row.tournamentId);
    if (weight === undefined) continue; // tournoi non lie a la league

    const basePoints = pointsTable[String(row.rank)] ?? 0;
    const points = basePoints * weight;

    const e = ensure(row.teamId);
    e.points += points;
    e.tournamentsCounted += 1;
    if (e.bestRank === null || row.rank < e.bestRank) e.bestRank = row.rank;
  }

  // Scrims rattaches a la saison. Un scrim sans les DEUX equipes n'est pas un
  // resultat : on l'ignore plutot que de crediter un camp d'une victoire par
  // defaut.
  for (const scrim of scrims) {
    if (!scrim.team1Id || !scrim.team2Id) continue;
    const weight = scrim.weight ?? 1;
    const isDraw = !scrim.winnerTeamId;
    for (const teamId of [scrim.team1Id, scrim.team2Id]) {
      const e = ensure(teamId);
      const base = isDraw
        ? scrimPoints.draw
        : scrim.winnerTeamId === teamId
          ? scrimPoints.win
          : scrimPoints.loss;
      e.points += base * weight;
      e.scrimsCounted += 1;
    }
  }

  const rows: LeagueStandingRow[] = [];
  agg.forEach((e, teamId) => {
    rows.push({
      teamId,
      points: e.points,
      tournamentsCounted: e.tournamentsCounted,
      scrimsCounted: e.scrimsCounted,
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
