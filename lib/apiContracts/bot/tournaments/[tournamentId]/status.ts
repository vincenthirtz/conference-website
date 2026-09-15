// Contrat de /api/bot/v1/tournaments/[tournamentId]/status — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tournaments/[tournamentId]/status`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// status est trimmé + minusculisé avant la vérification d'appartenance, comme
// le faisait le handler historique.
export const statusBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  status: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['draft', 'published'])),
});
