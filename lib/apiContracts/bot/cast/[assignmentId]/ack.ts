// Contrat de /api/bot/v1/cast/[assignmentId]/ack — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.cast/[assignmentId]/ack`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

export const ackBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
});
