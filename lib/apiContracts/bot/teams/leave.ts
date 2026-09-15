// Contrat de /api/bot/v1/teams/leave — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/leave`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../utils/botValidation';

// requireBotPlayer lit actorDiscordUserId dans le body brut (non muté).
export const leaveBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
});
