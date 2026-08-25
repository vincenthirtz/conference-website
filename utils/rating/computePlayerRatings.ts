// utils/rating/computePlayerRatings.ts
//
// Replay chronologique PUR (aucune I/O) qui calcule le rating Glicko-2
// persistant de chaque joueur a partir des matches et de leurs participants.
//
// Regles :
//  - On ne note QUE les matches status ∈ {'finished','walkover'}, non-bye,
//    avec team1Id, team2Id et winnerTeamId non nuls. Le reste est ignore.
//  - Les matches sont rejoues par completedAt ASC ; en cas de completedAt null
//    l'ordre d'entree stable est conserve (tri stable, null place en dernier).
//  - Seuls les participants NON-substitutes (isSubstitute === false) sont notes.
//    Si un camp n'a aucun participant note, le match est saute (attribution non
//    fiable).
//  - Simplification assumee : 1 match = 1 periode Glicko-2 par joueur.
//    L'adversaire de chaque joueur est un PSEUDO-adversaire dont :
//        rating = moyenne des ratings COURANTS des participants notes adverses
//        rd     = moyenne de leurs rd
//    Score = 1 pour le camp gagnant, 0 pour le perdant (pas de nul en tournoi).
//    Chaque joueur d'un camp recoit un unique GlickoOutcome vs ce pseudo-adv.
//  - opponentAvgRating dans l'history = rating moyen du camp adverse AVANT match.
//  - Un SCRIM (match miroir, `scrimId` non nul) pese moins qu'un match de
//    competition : cf. SCRIM_RATING_WEIGHT plus bas.
//  - Un scrim peut se jouer contre une equipe SANS joueuses en base (sparring
//    externe) : ce camp-la est alors represente par un adversaire par defaut
//    et ne recoit aucun rating. Cette tolerance est reservee aux scrims.

import {
  updateGlicko,
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  type GlickoOutcome,
} from './glicko2';

// ---------------------------------------------------------------------------
// Types d'entree.
// ---------------------------------------------------------------------------

export type RatingMatch = {
  id: string;
  tournamentId: string | null;
  /**
   * Scrim d'origine quand ce match est le MIROIR d'un scrim
   * (cf. utils/scrims/ratedMatch.ts). Non nul => partie d'entrainement :
   * poids reduit, et adversaire sans roster tolere.
   */
  scrimId?: string | null;
  team1Id: string | null;
  team2Id: string | null;
  winnerTeamId: string | null;
  completedAt: string | null;
  status: string;
  isBye: boolean | null;
  forfeitTeamId: string | null;
};

export type RatingParticipant = {
  matchId: string;
  teamId: string;
  userId: string;
  isSubstitute: boolean;
};

// ---------------------------------------------------------------------------
// Types de sortie.
// ---------------------------------------------------------------------------

export type PlayerRatingState = {
  userId: string;
  rating: number;
  rd: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  peakRating: number;
  lastMatchAt: string | null;
};

export type PlayerRatingHistoryRow = {
  userId: string;
  matchId: string;
  tournamentId: string | null;
  ratingBefore: number;
  ratingAfter: number;
  rdBefore: number;
  rdAfter: number;
  volatilityBefore: number;
  volatilityAfter: number;
  opponentAvgRating: number | null;
  result: 'win' | 'loss' | 'draw';
  occurredAt: string;
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const SCORED_STATUSES = new Set(['finished', 'walkover']);

/**
 * Poids d'un scrim dans le rating, relatif a un match de competition (1).
 *
 * WHY : gagner un entrainement ne vaut pas gagner un match de tournoi. Sans
 * ce poids, une equipe qui enchaine les scrims contre des adversaires faibles
 * grimperait au classement aussi vite qu'une equipe qui gagne la competition,
 * et le classement cesserait de dire quoi que ce soit sur le niveau en match
 * officiel.
 *
 * COMMENT : on ne bricole pas le moteur Glicko-2 (ce serait fausser ses
 * proprietes mathematiques). On calcule la mise a jour normale, puis on
 * n'applique qu'une FRACTION du deplacement — rating, RD et volatilite
 * ensemble. A 0.5, un scrim bouge deux fois moins qu'un match officiel, et
 * reduit deux fois moins l'incertitude : il informe moitie moins.
 */
export const SCRIM_RATING_WEIGHT = 0.5;

/**
 * Applique une FRACTION du deplacement calcule par Glicko-2.
 *
 * PUR. `weight = 1` renvoie `next` tel quel (aucune perte de precision sur le
 * chemin nominal) ; `weight = 0` laisserait l'etat inchange.
 */
function blendGlicko(
  prev: { rating: number; rd: number; volatility: number },
  next: { rating: number; rd: number; volatility: number },
  weight: number
): { rating: number; rd: number; volatility: number } {
  if (weight >= 1) return next;
  return {
    rating: prev.rating + weight * (next.rating - prev.rating),
    rd: prev.rd + weight * (next.rd - prev.rd),
    volatility: prev.volatility + weight * (next.volatility - prev.volatility),
  };
}

/** Cree un etat de rating vierge pour un nouveau joueur. */
function newState(userId: string): PlayerRatingState {
  return {
    userId,
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    volatility: DEFAULT_VOLATILITY,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    peakRating: DEFAULT_RATING,
    lastMatchAt: null,
  };
}

/** Recupere (ou cree) l'etat mutable d'un joueur dans la map. */
function ensureState(
  states: Map<string, PlayerRatingState>,
  userId: string
): PlayerRatingState {
  let s = states.get(userId);
  if (!s) {
    s = newState(userId);
    states.set(userId, s);
  }
  return s;
}

/** Indique si un match est eligible a la notation. */
function isScorable(match: RatingMatch): boolean {
  if (match.isBye) return false;
  if (!SCORED_STATUSES.has(match.status)) return false;
  if (!match.team1Id || !match.team2Id || !match.winnerTeamId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Application d'un match.
// ---------------------------------------------------------------------------

/**
 * Applique UN match a une map d'etats mutable et renvoie les lignes d'history
 * generees (une par joueur note). Utilise par le replay complet ET par la
 * mise a jour incrementale cote API.
 *
 * Si le match n'est pas notable ou qu'un camp n'a aucun participant note,
 * la fonction ne modifie rien et renvoie [].
 */
export function applyMatchToStates(
  states: Map<string, PlayerRatingState>,
  match: RatingMatch,
  participants: RatingParticipant[]
): PlayerRatingHistoryRow[] {
  if (!isScorable(match)) return [];

  const team1Id = match.team1Id as string;
  const team2Id = match.team2Id as string;

  // Participants notes (non-substitutes) par camp.
  const team1Users: string[] = [];
  const team2Users: string[] = [];
  for (const p of participants) {
    if (p.matchId !== match.id) continue;
    if (p.isSubstitute) continue;
    if (p.teamId === team1Id) team1Users.push(p.userId);
    else if (p.teamId === team2Id) team2Users.push(p.userId);
  }

  // Un scrim peut se jouer contre un sparring-partner qui n'a aucune joueuse
  // en base : ce camp est alors represente par un adversaire par defaut
  // (1500 / RD 350, soit l'incertitude maximale — on ne sait rien de lui) et
  // ne recoit aucune ligne d'historique. La tolerance s'arrete la : sur un
  // match de COMPETITION, un camp sans participants signale une donnee
  // incomplete, et noter dessus serait une attribution au hasard.
  const isScrim = Boolean(match.scrimId);
  if (team1Users.length === 0 && team2Users.length === 0) return [];
  if (!isScrim && (team1Users.length === 0 || team2Users.length === 0)) {
    return [];
  }

  const occurredAt = match.completedAt ?? '';

  // Etats courants AVANT match (pour construire les pseudo-adversaires).
  const before = new Map<string, PlayerRatingState>();
  for (const uid of [...team1Users, ...team2Users]) {
    const s = ensureState(states, uid);
    before.set(uid, { ...s });
  }

  const avg = (
    users: string[],
    pick: (s: PlayerRatingState) => number,
    fallback: number
  ) =>
    users.length === 0
      ? fallback
      : users.reduce(
          (acc, uid) => acc + pick(before.get(uid) as PlayerRatingState),
          0
        ) / users.length;

  const team1AvgRating = avg(team1Users, (s) => s.rating, DEFAULT_RATING);
  const team1AvgRd = avg(team1Users, (s) => s.rd, DEFAULT_RD);
  const team2AvgRating = avg(team2Users, (s) => s.rating, DEFAULT_RATING);
  const team2AvgRd = avg(team2Users, (s) => s.rd, DEFAULT_RD);

  const winnerId = match.winnerTeamId as string;

  const rows: PlayerRatingHistoryRow[] = [];

  const processSide = (
    users: string[],
    oppAvgRating: number,
    oppAvgRd: number,
    isWinner: boolean
  ) => {
    const score = isWinner ? 1 : 0;
    const result: 'win' | 'loss' = isWinner ? 'win' : 'loss';
    const outcome: GlickoOutcome = {
      opponentRating: oppAvgRating,
      opponentRd: oppAvgRd,
      score,
    };
    const weight = isScrim ? SCRIM_RATING_WEIGHT : 1;

    for (const uid of users) {
      const prev = before.get(uid) as PlayerRatingState;
      const next = blendGlicko(
        prev,
        updateGlicko(
          { rating: prev.rating, rd: prev.rd, volatility: prev.volatility },
          [outcome]
        ),
        weight
      );
      const s = states.get(uid) as PlayerRatingState;
      s.rating = next.rating;
      s.rd = next.rd;
      s.volatility = next.volatility;
      s.gamesPlayed += 1;
      if (isWinner) s.wins += 1;
      else s.losses += 1;
      if (next.rating > s.peakRating) s.peakRating = next.rating;
      s.lastMatchAt = match.completedAt;

      rows.push({
        userId: uid,
        matchId: match.id,
        tournamentId: match.tournamentId,
        ratingBefore: prev.rating,
        ratingAfter: next.rating,
        rdBefore: prev.rd,
        rdAfter: next.rd,
        volatilityBefore: prev.volatility,
        volatilityAfter: next.volatility,
        opponentAvgRating: oppAvgRating,
        result,
        occurredAt,
      });
    }
  };

  processSide(team1Users, team2AvgRating, team2AvgRd, winnerId === team1Id);
  processSide(team2Users, team1AvgRating, team1AvgRd, winnerId === team2Id);

  return rows;
}

// ---------------------------------------------------------------------------
// Replay complet.
// ---------------------------------------------------------------------------

/**
 * Rejoue l'ensemble des matches dans l'ordre chronologique et renvoie les
 * etats finaux de chaque joueur ainsi que l'historique complet.
 */
export function computePlayerRatings(input: {
  matches: RatingMatch[];
  participantsByMatch: Map<string, RatingParticipant[]>;
}): {
  ratings: Map<string, PlayerRatingState>;
  history: PlayerRatingHistoryRow[];
} {
  const { matches, participantsByMatch } = input;

  // Tri chronologique stable : completedAt ASC, null en dernier, ordre d'entree
  // preserve a egalite (on indexe pour garantir la stabilite).
  const indexed = matches.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    const ca = a.m.completedAt;
    const cb = b.m.completedAt;
    if (ca === cb) return a.i - b.i;
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return a.i - b.i;
  });

  const states = new Map<string, PlayerRatingState>();
  const history: PlayerRatingHistoryRow[] = [];

  for (const { m } of indexed) {
    const participants = participantsByMatch.get(m.id) ?? [];
    const rows = applyMatchToStates(states, m, participants);
    for (const r of rows) history.push(r);
  }

  return { ratings: states, history };
}
