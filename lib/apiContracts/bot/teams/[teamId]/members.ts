// Contrat de /api/bot/v1/teams/[teamId]/members — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/[teamId]/members`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// actorDiscordUserId lu par requireBotPlayer (body brut, non muté).
export const kickMemberBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  targetDiscordUserId: discordIdSchema,
});
