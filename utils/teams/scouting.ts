// utils/teams/scouting.ts
//
// Dossier d'adversaire (N5) — cœur PUR, zéro I/O.
//
// À J-1 d'un match, une équipe n'avait aucune préparation possible depuis le
// site : ni « on les a déjà jouées », ni « elles sortent de quoi », ni « on a
// un adversaire en commun ». Tout ça existe pourtant en base — éparpillé dans
// `matches` et `scrims`, jamais recomposé.
//
// TROIS RÈGLES, dans l'ordre où elles comptent :
//
//   1. AUCUNE DONNÉE PRIVÉE DE L'ADVERSAIRE. Le dossier ne se nourrit que de
//      RÉSULTATS — qui sont publics et connus des deux camps. Jamais de leurs
//      revues (N2), jamais de leur rythme déclaré (N1), jamais de leur roster
//      interne. Un outil de préparation qui espionne n'est pas un outil de
//      préparation.
//
//      Corollaire important sur les « créneaux préférés » : ils sont dérivés
//      des heures RÉELLEMENT JOUÉES, pas d'une disponibilité déclarée. Ce que
//      l'adversaire a joué est public ; ce qu'il a déclaré ne l'est pas.
//
//   2. MA propre mémoire fait partie du dossier. Les revues que MON équipe a
//      écrites sur cet adversaire (N2) sont la matière la plus précieuse d'une
//      préparation — et elles m'appartiennent. Elles sont assemblées ici, pas
//      laissées à un autre écran.
//
//   3. RIEN SOUS UN SEUIL D'ÉCHANTILLON. Même règle que la fiabilité (R10) :
//      une « forme » calculée sur un match est une anecdote présentée comme une
//      tendance. Chaque section sait se taire.

/** En dessous, une section ne dit rien : l'échantillon n'a pas de sens. */
export const SCOUT_MIN_SAMPLE = 3;

/** Confrontations directes affichées en détail. */
export const HEAD_TO_HEAD_LIMIT = 5;

/** Longueur de la série « forme récente ». */
export const FORM_LENGTH = 5;

export type GameResult = 'win' | 'loss' | 'draw';

/**
 * Un affrontement JOUÉ, vu de l'extérieur : deux équipes, un vainqueur, une
 * date. C'est tout ce dont le dossier a besoin — et tout ce qu'il s'autorise.
 */
export type PlayedGame = {
  subjectType: 'match' | 'scrim';
  subjectId: string;
  playedAt: string | null;
  team1Id: string | null;
  team2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
};

export type HeadToHead = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Les plus récentes d'abord, du point de vue de MON équipe. */
  recent: Array<{
    subjectType: 'match' | 'scrim';
    subjectId: string;
    playedAt: string | null;
    result: GameResult;
    myScore: number | null;
    opponentScore: number | null;
  }>;
};

export type CommonOpponent = {
  teamId: string;
  /** Mon bilan face à cet adversaire commun. */
  myWins: number;
  myLosses: number;
  /** Le bilan de la cible face au même adversaire. */
  theirWins: number;
  theirLosses: number;
};

export type PlaySlot = {
  /** Jour ISO 1-7 (1 = lundi), dans le fuseau de référence. */
  weekday: number;
  /** Heure pleine locale. */
  hour: number;
  count: number;
};

export type ScoutingReport = {
  headToHead: HeadToHead;
  /** Forme récente de la CIBLE, tous adversaires confondus. `null` sous seuil. */
  recentForm: GameResult[] | null;
  /** Bilan global de la cible. `null` sous seuil. */
  record: { played: number; wins: number; losses: number } | null;
  commonOpponents: CommonOpponent[];
  /** Créneaux où la cible joue le plus souvent. `null` sous seuil. */
  usualSlots: PlaySlot[] | null;
};

/** Issue d'un affrontement du point de vue de `teamId`. */
export function resultFor(game: PlayedGame, teamId: string): GameResult | null {
  const involved = game.team1Id === teamId || game.team2Id === teamId;
  if (!involved) return null;
  // Un affrontement sans vainqueur ET sans scores n'est pas encore un
  // résultat : le compter comme nul fabriquerait une statistique.
  if (!game.winnerTeamId) {
    const a = game.team1Score;
    const b = game.team2Score;
    if (a == null || b == null) return null;
    if (a === b) return 'draw';
    const team1Won = a > b;
    return (game.team1Id === teamId) === team1Won ? 'win' : 'loss';
  }
  return game.winnerTeamId === teamId ? 'win' : 'loss';
}

/** L'autre équipe d'un affrontement, vue depuis `teamId`. */
function opponentOf(game: PlayedGame, teamId: string): string | null {
  if (game.team1Id === teamId) return game.team2Id;
  if (game.team2Id === teamId) return game.team1Id;
  return null;
}

function sortByDateDesc(a: PlayedGame, b: PlayedGame): number {
  const ta = a.playedAt ? Date.parse(a.playedAt) : NaN;
  const tb = b.playedAt ? Date.parse(b.playedAt) : NaN;
  const va = Number.isFinite(ta);
  const vb = Number.isFinite(tb);
  if (va && vb) return tb - ta;
  if (va) return -1;
  if (vb) return 1;
  return 0;
}

/**
 * Compose le dossier.
 *
 * `myGames` et `theirGames` peuvent se recouper (les confrontations directes
 * apparaissent dans les deux) : la fonction s'en accommode, chaque section
 * filtrant ce qui la concerne.
 */
export function buildScoutingReport(
  myTeamId: string,
  targetTeamId: string,
  myGames: PlayedGame[],
  theirGames: PlayedGame[],
  /** Fuseau dans lequel lire les heures de jeu habituelles. */
  timeZoneOffsetMinutes = 0
): ScoutingReport {
  /* ------------------------------------------------ confrontations directes */
  const direct = myGames
    .filter(
      (g) =>
        opponentOf(g, myTeamId) === targetTeamId &&
        resultFor(g, myTeamId) !== null
    )
    .sort(sortByDateDesc);

  const headToHead: HeadToHead = {
    played: direct.length,
    wins: 0,
    losses: 0,
    draws: 0,
    recent: [],
  };
  for (const game of direct) {
    const result = resultFor(game, myTeamId)!;
    if (result === 'win') headToHead.wins += 1;
    else if (result === 'loss') headToHead.losses += 1;
    else headToHead.draws += 1;

    if (headToHead.recent.length < HEAD_TO_HEAD_LIMIT) {
      const isTeam1 = game.team1Id === myTeamId;
      headToHead.recent.push({
        subjectType: game.subjectType,
        subjectId: game.subjectId,
        playedAt: game.playedAt,
        result,
        myScore: isTeam1 ? game.team1Score : game.team2Score,
        opponentScore: isTeam1 ? game.team2Score : game.team1Score,
      });
    }
  }

  /* --------------------------------------------------- forme et bilan cible */
  const theirDecided = theirGames
    .filter((g) => resultFor(g, targetTeamId) !== null)
    .sort(sortByDateDesc);

  const enoughTheirGames = theirDecided.length >= SCOUT_MIN_SAMPLE;

  const recentForm = enoughTheirGames
    ? theirDecided.slice(0, FORM_LENGTH).map((g) => resultFor(g, targetTeamId)!)
    : null;

  const record = enoughTheirGames
    ? theirDecided.reduce(
        (acc, g) => {
          const r = resultFor(g, targetTeamId)!;
          acc.played += 1;
          if (r === 'win') acc.wins += 1;
          else if (r === 'loss') acc.losses += 1;
          return acc;
        },
        { played: 0, wins: 0, losses: 0 }
      )
    : null;

  /* ------------------------------------------------------ adversaires communs */
  // Le renseignement le plus utile d'une préparation : « on a battu X qu'elles
  // ont perdu » situe mieux que n'importe quel rating.
  const myByOpponent = tallyByOpponent(myGames, myTeamId);
  const theirByOpponent = tallyByOpponent(theirGames, targetTeamId);

  const commonOpponents: CommonOpponent[] = [];
  for (const [teamId, mine] of myByOpponent) {
    if (teamId === targetTeamId || teamId === myTeamId) continue;
    const theirs = theirByOpponent.get(teamId);
    if (!theirs) continue;
    commonOpponents.push({
      teamId,
      myWins: mine.wins,
      myLosses: mine.losses,
      theirWins: theirs.wins,
      theirLosses: theirs.losses,
    });
  }
  commonOpponents.sort(
    (a, b) =>
      b.myWins +
      b.myLosses +
      b.theirWins +
      b.theirLosses -
      (a.myWins + a.myLosses + a.theirWins + a.theirLosses)
  );

  /* ----------------------------------------------------- créneaux habituels */
  const usualSlots = enoughTheirGames
    ? buildUsualSlots(theirDecided, timeZoneOffsetMinutes)
    : null;

  return { headToHead, recentForm, record, commonOpponents, usualSlots };
}

function tallyByOpponent(
  games: PlayedGame[],
  teamId: string
): Map<string, { wins: number; losses: number }> {
  const out = new Map<string, { wins: number; losses: number }>();
  for (const game of games) {
    const other = opponentOf(game, teamId);
    if (!other) continue;
    const result = resultFor(game, teamId);
    if (result === null || result === 'draw') continue;
    const acc = out.get(other) ?? { wins: 0, losses: 0 };
    if (result === 'win') acc.wins += 1;
    else acc.losses += 1;
    out.set(other, acc);
  }
  return out;
}

/**
 * Créneaux où la cible joue le plus souvent, dérivés des heures RÉELLEMENT
 * jouées — jamais d'une disponibilité déclarée (cf. règle 1).
 *
 * Le décalage est passé en minutes plutôt qu'en fuseau IANA : le module reste
 * pur, et l'appelant sait déjà dans quel fuseau il veut lire.
 */
function buildUsualSlots(
  games: PlayedGame[],
  offsetMinutes: number
): PlaySlot[] {
  const tally = new Map<string, PlaySlot>();
  for (const game of games) {
    if (!game.playedAt) continue;
    const t = Date.parse(game.playedAt);
    if (!Number.isFinite(t)) continue;
    const local = new Date(t + offsetMinutes * 60_000);
    const day = local.getUTCDay();
    const weekday = day === 0 ? 7 : day;
    const hour = local.getUTCHours();
    const key = `${weekday}-${hour}`;
    const slot = tally.get(key) ?? { weekday, hour, count: 0 };
    slot.count += 1;
    tally.set(key, slot);
  }
  return Array.from(tally.values())
    .sort(
      (a, b) => b.count - a.count || a.weekday - b.weekday || a.hour - b.hour
    )
    .slice(0, 3);
}
