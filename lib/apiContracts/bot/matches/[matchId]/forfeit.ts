// Contrat de /api/bot/v1/matches/[matchId]/forfeit — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/forfeit`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
} from '../../../../../utils/botValidation';

export const forfeitBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  forfeitTeamId: uuidSchema,
});
