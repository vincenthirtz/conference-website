// utils/stages/standingsCache.ts
// In-memory cache for Swiss standings to avoid recomputing Buchholz
// on every request. Invalidated when a match score changes.

import type { StageStanding } from './standings';

type CacheEntry = {
  standings: StageStanding[];
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Maximum age before a cache entry is considered stale (5 minutes). */
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Returns cached standings for a stage, or null if not cached / stale.
 */
export function getCachedStandings(stageId: string): StageStanding[] | null {
  const entry = cache.get(stageId);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
    cache.delete(stageId);
    return null;
  }

  return entry.standings;
}

/**
 * Stores computed standings in cache.
 */
export function setCachedStandings(
  stageId: string,
  standings: StageStanding[]
): void {
  cache.set(stageId, {
    standings,
    cachedAt: Date.now(),
  });
}

/**
 * Invalidates cached standings for a stage.
 * Call this when a match score changes in the stage.
 */
export function invalidateStandingsCache(stageId: string): void {
  cache.delete(stageId);
}

/**
 * Invalidates all cached standings. Useful for bulk operations.
 */
export function invalidateAllStandingsCache(): void {
  cache.clear();
}
