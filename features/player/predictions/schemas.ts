// features/player/predictions/schemas.ts — pronostics de la joueuse (lots P4,
// P12). Zod seul : importé par le service, le registre OpenAPI
// (lib/apiContracts) et le client. Le corps de PUT
// /api/player/predictions/{matchId} vit dans
// lib/apiContracts/player/predictions/body.ts (antérieur à P4) : ré-exporté
// ici pour que le module n'ait qu'une porte d'entrée.

import * as z from 'zod';

// Chemin relatif : ce fichier est lu par l'assembleur OpenAPI (sans alias).
export { predictionBodySchema as PredictionBody } from '../../../lib/apiContracts/player/predictions/body';

/** Corps de PUT /api/player/predictions/leaderboard. */
export const LeaderboardVisibilityBody = z.object({
  showInLeaderboard: z.boolean(),
});
export type LeaderboardVisibilityInput = z.infer<
  typeof LeaderboardVisibilityBody
>;

// Formes de réponse : calculées par les lecteurs de utils/predictions.
export type {
  MatchPredictionState,
  PlayerPredictionsResponse,
} from '@/utils/predictions/readState';
export type { PredictionLeaderboardResponse } from '@/utils/predictions/readLeaderboard';

/** Réponse de PUT /api/player/predictions/{matchId}. */
export type PredictionSaved = {
  prediction: {
    teamId: string;
    result: 'won' | 'lost' | 'void' | null;
    updatedAt: string;
  };
};
