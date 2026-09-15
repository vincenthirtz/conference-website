// Contrat de /api/bot/v1/stages/[stageId]/auto-byes — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.stages/[stageId]/auto-byes`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// scoreForBye historique : nombre >= 0 (non forcément entier), défaut 1.
// propagate : seul `false` explicite le désactive (défaut true).
export const autoByesBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  roundNumber: z.number().int().optional(),
  scoreForBye: z.number().min(0).optional(),
  propagate: z.boolean().optional(),
});
