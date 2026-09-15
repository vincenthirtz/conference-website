// Contrat de /api/bot/v1/teams/[teamId]/transfer-captain — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/[teamId]/transfer-captain`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// actorDiscordUserId lu par requireBotPlayer (body brut, non muté).
export const transferCaptainBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  newCaptainDiscordUserId: discordIdSchema,
});
