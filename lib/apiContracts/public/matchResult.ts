// Contrat de POST /api/public/v1/matches/{id}/result (écriture partenaire).
// Source unique handler ↔ spec (`x-zod: public.v1.matchResult`).

import { z } from 'zod';
import { scoreSchema, uuidSchema } from '../../../utils/botValidation';

export const matchResultBodySchema = z.object({
  team1Score: scoreSchema,
  team2Score: scoreSchema,
});

export const matchResultQuerySchema = z.object({ id: uuidSchema });
