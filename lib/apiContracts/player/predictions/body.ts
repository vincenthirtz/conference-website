// Corps de PUT /api/player/predictions/{matchId} — source unique handler ↔
// spec OpenAPI (`x-zod: player.predictions.set`).
// Module sans effet de bord : zod seulement.

import { z } from 'zod';

export const predictionBodySchema = z
  .object({
    /** L'équipe que la joueuse voit gagner : l'une des deux du match. */
    teamId: z.string().uuid(),
  })
  .strict();
