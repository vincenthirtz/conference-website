// Contrat de /api/bot/v1/matches/[matchId]/report — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/report`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  scoreSchema,
} from '../../../../../utils/botValidation';

export const reportBodySchema = z.object({
  discordUserId: discordIdSchema,
  team1Score: scoreSchema,
  team2Score: scoreSchema,
});
