// Contrat de /api/bot/v1/tickets/close-log — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tickets/close-log`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
} from '../../../../utils/botValidation';

export const closeLogBodySchema = z.object({
  closedByDiscordId: discordIdSchema,
  number: z.number().int().min(0),
  category: boundedString(1, 100),
  openerDiscordId: discordIdSchema,
  claimedByDiscordId: discordIdSchema.nullish(),
  messageCount: z.number().int().min(0).nullish(),
  channelName: boundedString(1, 200).nullish(),
});
