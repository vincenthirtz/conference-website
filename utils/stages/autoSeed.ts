// utils/stages/autoSeed.ts
//
// Compute-only helpers for bracket auto-seeding. Split from the apply
// endpoint (pages/api/admin/stages/[stageId]/auto-seed.ts) so the new
// `seeding-preview` endpoint can run the SAME logic without writing.
//
// No Supabase calls here — pure functions over already-fetched data.

export type SeedingPattern = 'standard' | 'sequential';

export type StandingForSeeding = {
  teamId: string;
  rank: number;
};

export type BracketSlotRef = {
  matchId: string;
};

export type ProposedSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed: number;
};

/**
 * Build the placement order used by computeProposedSeeding : index i of the
 * returned array tells us where the team of rank (i+1) should land in the
 * bracket.
 *
 * Standard seeding : `generateBracketPositions(2N)` returns the seed numbers
 * in PAIR-ADJACENT order — positions[0] and positions[1] face each other in
 * match 0, positions[2]/positions[3] in match 1, etc. To assign teams, we
 * need the inverse mapping : for each rank r, find at which positional index
 * `r` appears, then derive matchIndex/slot from that index.
 *
 * Sequential : seed 1 in match 0 slot 1, seed 2 in match 0 slot 2, ...
 *
 * Historical bug (pre-Lot 2) : the previous implementation used `idx = seed - 1`
 * as the positional index, which only worked for the sequential pattern. For
 * standard, 4 teams ended up paired 1v3/2v4 instead of the canonical 1v4/2v3.
 * Existing tests only checked counts, so this regression slipped in. Fixed
 * here by iterating positional indices.
 */
export function buildSeedOrder(
  numMatches: number,
  pattern: SeedingPattern
): { matchIndex: number; slot: 1 | 2 }[] {
  const totalTeams = numMatches * 2;
  const order: { matchIndex: number; slot: 1 | 2 }[] = new Array(totalTeams);

  if (pattern === 'sequential') {
    for (let i = 0; i < numMatches; i++) {
      order[2 * i] = { matchIndex: i, slot: 1 };
      order[2 * i + 1] = { matchIndex: i, slot: 2 };
    }
    return order;
  }

  const positions = generateBracketPositions(totalTeams);
  for (let posIdx = 0; posIdx < positions.length; posIdx++) {
    const seed = positions[posIdx]; // 1-based rank
    const matchIndex = Math.floor(posIdx / 2);
    const slot: 1 | 2 = posIdx % 2 === 0 ? 1 : 2;
    order[seed - 1] = { matchIndex, slot };
  }
  return order;
}

/**
 * Generate standard bracket seeding positions.
 * Returns an array where index i contains the seed number placed at position i.
 * Uses recursive splitting: [1, 2N, N+1, N, ...] pattern.
 */
export function generateBracketPositions(size: number): number[] {
  if (size <= 1) return [1];
  if (size === 2) return [1, 2];

  const half = size / 2;
  const topHalf = generateBracketPositions(half);

  const result: number[] = [];
  for (const seed of topHalf) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

/**
 * Pure compute of proposed slot assignments given source-stage standings and
 * the target bracket's round-1 matches. Returns the list of (matchId, slot,
 * teamId, seed) the apply endpoint would write — without writing.
 */
export function computeProposedSeeding(params: {
  standings: StandingForSeeding[];
  bracketMatches: BracketSlotRef[]; // round 1, in stable order
  pattern: SeedingPattern;
}): ProposedSlot[] {
  const { standings, bracketMatches, pattern } = params;
  if (bracketMatches.length === 0 || standings.length === 0) return [];

  const totalSlots = bracketMatches.length * 2;
  const teamsToSeed = standings.slice(0, totalSlots);
  const seedOrder = buildSeedOrder(bracketMatches.length, pattern);

  const result: ProposedSlot[] = [];
  for (let i = 0; i < seedOrder.length && i < teamsToSeed.length; i++) {
    const { matchIndex, slot } = seedOrder[i];
    if (matchIndex >= bracketMatches.length) continue;
    const match = bracketMatches[matchIndex];
    const team = teamsToSeed[i];
    result.push({
      matchId: match.matchId,
      slot,
      teamId: team.teamId,
      seed: team.rank,
    });
  }
  return result;
}
