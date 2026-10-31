// utils/stages/standingsCache.ts
// In-memory cache for Swiss standings to avoid recomputing Buchholz
// on every request. Invalidated when a match is written, on any instance
// (utils/dormancyMemo.ts, utils/competitionWrites.ts).

import { MATCH_WRITE_SIGNAL } from '../competitionWrites';
import { createDormancyMemo } from '../dormancyMemo';
import type { StageStanding } from './standings';

/** Maximum age before a cache entry is considered stale (5 minutes). */
const MAX_AGE_MS = 5 * 60 * 1000;

const memo = createDormancyMemo<StageStanding[]>(
  'stages.standings',
  MAX_AGE_MS,
  [MATCH_WRITE_SIGNAL]
);

/**
 * Returns cached standings for a stage, or null if not cached / stale.
 */
export function getCachedStandings(stageId: string): StageStanding[] | null {
  return memo.get(stageId, Date.now())?.value ?? null;
}

/**
 * Stores computed standings in cache.
 */
export function setCachedStandings(
  stageId: string,
  standings: StageStanding[]
): void {
  const nowMs = Date.now();
  memo.set(stageId, standings, memo.ticket(nowMs));
}

/**
 * Invalidates cached standings. Call this when a match score changes in a
 * stage. Every stage is forgotten: recomputing costs little, and this is only
 * reached on a write.
 */
export function invalidateStandingsCache(_stageId: string): void {
  memo.invalidate();
}

/**
 * Invalidates all cached standings. Useful for bulk operations.
 */
export function invalidateAllStandingsCache(): void {
  memo.invalidate();
}
