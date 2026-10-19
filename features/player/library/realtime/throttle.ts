// features/player/library/realtime/throttle.ts — les cadences d'ENVOI d'une
// joueuse sur le canal de sa salle (lot 5) : un déplacement toutes les
// 150 ms au plus, une emote ou une phrase par seconde au plus. Pur, testé
// seul (l'horloge est passée en argument).

export const MOVE_MIN_INTERVAL_MS = 150;
export const SOCIAL_MIN_INTERVAL_MS = 1_000;
/** La présence (case connue des nouvelles venues) se rafraîchit au plus toutes les secondes. */
export const PRESENCE_MIN_INTERVAL_MS = 1_000;

export type Gate = {
  /** Vrai (et la porte se referme pour `minIntervalMs`) si l'envoi passe. */
  tryPass(now: number): boolean;
  /** Millisecondes avant le prochain passage possible (0 = maintenant). */
  waitFor(now: number): number;
  reset(): void;
};

export function createGate(minIntervalMs: number): Gate {
  let last = Number.NEGATIVE_INFINITY;
  return {
    tryPass(now) {
      if (now - last < minIntervalMs) return false;
      last = now;
      return true;
    },
    waitFor(now) {
      return Math.max(0, last + minIntervalMs - now);
    },
    reset() {
      last = Number.NEGATIVE_INFINITY;
    },
  };
}
