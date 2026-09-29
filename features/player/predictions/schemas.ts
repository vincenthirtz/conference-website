// features/player/predictions/schemas.ts — pronostics de la joueuse (lot P4).
// Zod seul : importé par la route en chemin RELATIF (non migrée), par le
// registre OpenAPI (lib/apiContracts) et, demain, le client. Le corps de
// PUT /api/player/predictions/{matchId} vit dans
// lib/apiContracts/player/predictions/body.ts (antérieur à P4).

import { z } from 'zod';

/** Corps de PUT /api/player/predictions/leaderboard. */
export const LeaderboardVisibilityBody = z.object({
  showInLeaderboard: z.boolean(),
});
export type LeaderboardVisibilityInput = z.infer<
  typeof LeaderboardVisibilityBody
>;
