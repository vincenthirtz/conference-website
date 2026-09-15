// Contrat de /api/bot/v1/stages/[stageId]/finalize — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.stages/[stageId]/finalize`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// force : seul `true` explicite bypasse le garde matchs-actifs (défaut false).
export const finalizeBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  force: z.boolean().optional(),
});
