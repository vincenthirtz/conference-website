// Contrat de /api/bot/v1/stages/[stageId]/next-round — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.stages/[stageId]/next-round`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

export const nextRoundBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  roundNumber: z.number().int().optional(),
  scoreConfig: z.record(z.string(), z.number()).optional(),
  acceptRematches: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  // Tri-state préservé : absent → undefined (laisse le défaut interne), présent
  // → forcé à booléen. Lu via `=== true` dans le handler comme avant.
  allowRematchesFallback: z.boolean().optional(),
});
