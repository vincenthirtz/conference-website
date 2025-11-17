// lib/swiss/pairing.ts
// Génération de pairings Swiss pour un round donné
// - évite les rematches autant que possible
// - gère les BYE si nombre de participants impair
// - ne dépend pas directement de Supabase (pure logique TS)

/* -----------------------------------------------------------
 * Types publics
 * ---------------------------------------------------------*/

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
  player2Id: string | null; // null = bye
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

/* -----------------------------------------------------------
 * Public API
 * ---------------------------------------------------------*/

/**
 * Génère les pairings Swiss pour un round donné.
 *
 * @param options participants + matchs passés
 */
export function generateSwissPairings(
  options: GenerateSwissPairingsOptions
): SwissPairingResult {
  const { participants, pastMatches, allowRematchesFallback = true } =
    options;

  if (participants.length === 0) {
    return { pairings: [], hasRematches: false };
  }

  // 1) Construire la map des rematches déjà joués
  const alreadyPlayed = buildAlreadyPlayedMap(pastMatches);

  // 2) Copie des participants pour manipulation interne
  const pool = [...participants];

  // 3) Déterminer un éventuel bye (si nombre impair)
  const byePairing = pickByeIfNeeded(pool);

  // 4) Trier les participants par score DESC, seed ASC
  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.seed - b.seed;
  });

  const ids = pool.map((p) => p.id);

  // 5) Backtracking pour éviter rematches
  const pairingIds: { p1: string; p2: string }[] = [];

  const success = backtrackPairings(ids, alreadyPlayed, pairingIds);

  // 6) Si échec et fallback autorisé → on ignore la contrainte de rematch
  if (!success && allowRematchesFallback) {
    pairingIds.length = 0;
    greedyPairingsAllowRematch(ids, pairingIds);
  } else if (!success && !allowRematchesFallback) {
    throw new Error(
      "Impossible de trouver un pairing Swiss sans rematches et fallback désactivé."
    );
  }

  const basePairings: SwissPairing[] = pairingIds.map((p) => ({
    player1Id: p.p1,
    player2Id: p.p2,
    isBye: false,
  }));

  const pairings: SwissPairing[] = byePairing
    ? [byePairing, ...basePairings]
    : basePairings;

  const hasRematches = !success;

  return { pairings, hasRematches };
}

/* -----------------------------------------------------------
 * Construction de la map des rematches
 * ---------------------------------------------------------*/

/**
 * Map (symétrique) des rencontres déjà jouées :
 * alreadyPlayed["A"]["B"] = true  <=> A a déjà joué B
 */
function buildAlreadyPlayedMap(
  pastMatches: SwissPastMatch[]
): Record<string, Record<string, boolean>> {
  const map: Record<string, Record<string, boolean>> = {};

  for (const m of pastMatches) {
    const p1 = m.player1Id;
    const p2 = m.player2Id;
    if (!p1 || !p2) continue; // bye

    if (!map[p1]) map[p1] = {};
    if (!map[p2]) map[p2] = {};

    map[p1][p2] = true;
    map[p2][p1] = true;
  }

  return map;
}

/* -----------------------------------------------------------
 * Gestion du BYE
 * ---------------------------------------------------------*/

/**
 * Si le nombre de participants est impair, on choisit un joueur / équipe
 * qui recevra un BYE, puis on le retire de la pool.
 *
 * Règle simple :
 * - parmi ceux qui n'ont jamais eu de bye (hadBye !== true),
 *   on prend celui avec le score le plus bas,
 *   puis le seed le plus haut (ou plus bas au choix, ici seed le plus grand pour "récompenser" moins)
 * - si tous ont déjà eu un bye, on regarde tous les participants.
 */
function pickByeIfNeeded(
  pool: SwissParticipant[]
): SwissPairing | null {
  if (pool.length % 2 === 0) return null;

  const neverBye = pool.filter((p) => !p.hadBye);
  const candidates = neverBye.length > 0 ? neverBye : pool;

  // On choisit le candidat avec le score le plus bas,
  // puis seed le plus bas pour garder la logique simple et prévisible.
  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.seed - b.seed;
  });

  const byePlayer = candidates[0];
  const index = pool.findIndex((p) => p.id === byePlayer.id);
  if (index >= 0) {
    pool.splice(index, 1);
  }

  return {
    player1Id: byePlayer.id,
    player2Id: null,
    isBye: true,
  };
}

/* -----------------------------------------------------------
 * Backtracking : pairing sans rematch
 * ---------------------------------------------------------*/

/**
 * Essaie de générer des pairings sans rematch via backtracking.
 *
 * @param ids liste des IDs à apparier (longueur paire)
 * @param alreadyPlayed map des rencontres déjà jouées
 * @param outPairs résultat {p1, p2}
 * @returns boolean : true si une solution a été trouvée
 */
function backtrackPairings(
  ids: string[],
  alreadyPlayed: Record<string, Record<string, boolean>>,
  outPairs: { p1: string; p2: string }[]
): boolean {
  if (ids.length === 0) {
    return true;
  }

  const first = ids[0];

  for (let i = 1; i < ids.length; i++) {
    const candidate = ids[i];

    if (hasPlayed(alreadyPlayed, first, candidate)) {
      continue;
    }

    const remaining = ids.slice(1, i).concat(ids.slice(i + 1));

    outPairs.push({ p1: first, p2: candidate });

    if (backtrackPairings(remaining, alreadyPlayed, outPairs)) {
      return true;
    }

    outPairs.pop();
  }

  return false;
}

/**
 * Vérifie si a a déjà joué contre b
 */
function hasPlayed(
  alreadyPlayed: Record<string, Record<string, boolean>>,
  a: string,
  b: string
): boolean {
  return !!(alreadyPlayed[a] && alreadyPlayed[a][b]);
}

/* -----------------------------------------------------------
 * Fallback : pairing simple sans se soucier des rematches
 * ---------------------------------------------------------*/

/**
 * Fallback : pair les joueurs dans l'ordre, en ignorant les rematches.
 */
function greedyPairingsAllowRematch(
  ids: string[],
  outPairs: { p1: string; p2: string }[]
) {
  for (let i = 0; i < ids.length; i += 2) {
    outPairs.push({ p1: ids[i], p2: ids[i + 1] });
  }
}
