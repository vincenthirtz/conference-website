// Contrat de /api/bot/v1/matches/[matchId]/reset — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/reset`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

export const resetBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
});
