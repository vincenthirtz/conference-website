export interface SwissStandingParticipant {
  /** ID unique (team_id, player_id, etc.) */
  id: string;
  /** Nom affiché (optionnel, pour l'UI) */
  name?: string;
  /** Seed initial (plus petit = mieux classé) */
  seed?: number;
}

/**
 * Résultat d'un match utilisé pour le calcul des standings.
 * Les scores ici sont des points de tournoi (1 / 0.5 / 0, 3 / 1 / 0, etc.),
 * pas le score "ingame" (rounds, maps, etc.).
 */
export interface SwissMatchResult {
  round: number;
  player1Id: string;
  player2Id: string | null;
  /** Points gagnés par player1 pour le classement */
  player1Score: number;
  /** Points gagnés par player2 pour le classement (0 si bye) */
  player2Score: number;
}

/**
 * Standing final d'un joueur / équipe
 */
export interface SwissStanding {
  id: string;
  name?: string;
  seed?: number;

  /** Score total (somme des points sur tous les rounds) */
  score: number;

  /** Nombre de victoires / nulles / défaites (dérivé des scores) */
  wins: number;
  draws: number;
  losses: number;

  /** True si ce joueur a reçu au moins un bye */
  hadBye: boolean;

  /** Nombre de byes reçus (pénalisant pour le départage) */
  byeCount: number;

  /** Buchholz = somme des scores finaux des adversaires (hors bye) */
  buchholz: number;

  /**
   * Median Buchholz = Buchholz en retirant
   * le plus haut score d'adversaire et le plus bas
   * (si au moins 3 adversaires ; sinon = Buchholz).
   */
  medianBuchholz: number;

  /** Liste des IDs d'adversaires rencontrés (hors bye) */
  opponents: string[];
}

export interface RankedSwissStanding extends SwissStanding {
  rank: number;
}

/**
 * Options de calcul
 */
export interface ComputeSwissStandingsOptions {
  participants: SwissStandingParticipant[];
  results: SwissMatchResult[];
}

export interface SwissParticipant {
  /** ID unique (team_id, player_id, etc.) */
  id: string;
  /** Score actuel (points de tournoi : 3/1/0, 1/0.5/0, etc.) */
  score: number;
  /** Seed initial (plus petit = mieux classé au départ) */
  seed: number;
  /** A-t-il déjà reçu un bye ? (optionnel, mais recommandé) */
  hadBye?: boolean;
}

/**
 * Match passé (utilisé pour éviter les rematches)
 */
export interface SwissPastMatch {
  round: number;
  player1Id: string;
  player2Id: string | null;
}

/**
 * Pairing pour un round Swiss
 */
export interface SwissPairing {
  /** Joueur / équipe 1 */
  player1Id: string;
  /** Joueur / équipe 2 (null = bye) */
  player2Id: string | null;
  /** Est-ce un bye ? */
  isBye: boolean;
}

/**
 * Options pour générer un round Swiss
 */
export interface GenerateSwissPairingsOptions {
  participants: SwissParticipant[];
  pastMatches: SwissPastMatch[];
  /** Si true, l'algo peut tomber en fallback et autoriser des rematches si aucune solution "parfaite" n'existe. */
  allowRematchesFallback?: boolean;
}

/**
 * Résultat complet de génération
 */
export interface SwissPairingResult {
  pairings: SwissPairing[];
  /** True si l'algo a dû autoriser un (ou plusieurs) rematches pour trouver une solution */
  hasRematches: boolean;
}

/**
 * Configuration des points pour le système Swiss.
 * Exemples :
 * - Style "3/1/0" : win=3, draw=1, loss=0, bye=3
 * - Style "1/0.5/0" : win=1, draw=0.5, loss=0, bye=1
 */
export interface SwissScoreConfig {
  win: number;
  draw: number;
  loss: number;
  bye: number;
}

export type MatchOutcome = 'win' | 'loss' | 'draw' | 'bye';

/**
 * Input minimal pour décrire un résultat de match avant conversion.
 * - Si player2Id est null → bye automatique pour player1.
 */
export interface RawOutcomeInput {
  round: number;
  player1Id: string;
  player2Id: string | null;
  outcomeForP1: MatchOutcome;
}
