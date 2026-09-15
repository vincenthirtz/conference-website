// Contrat de POST /api/public/v1/matches/{id}/result (écriture partenaire).
// Source unique handler ↔ spec (`x-zod: public.v1.matchResult`).

import { z } from 'zod';
import { scoreSchema, uuidSchema } from '../../../utils/botValidation';

export const matchResultBodySchema = z.object({
  team1Score: scoreSchema,
  team2Score: scoreSchema,
});

export const matchResultQuerySchema = z.object({ id: uuidSchema });

/** Réponse 200 : le handler construit sa réponse avec ce type (vérifié au typecheck). */
export const matchResultResponseSchema = z.object({
  data: z.object({
    matchId: z.uuid(),
    status: z.literal('finished'),
    team1Score: z.number().int(),
    team2Score: z.number().int(),
    winnerTeamId: z.string().nullable(),
  }),
});
export type MatchResultResponse = z.output<typeof matchResultResponseSchema>;
