// Contrat de /api/bot/v1/tournaments/[tournamentId]/teams — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tournaments/[tournamentId]/teams`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
} from '../../../../../utils/botValidation';

// Body POST (l'inscription). Le bodySchema ne s'applique qu'au POST, donc le
// GET (liste) n'est pas affecté. stageId est optionnel (toutes phases si absent).
export const registerBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  teamId: uuidSchema,
  stageId: uuidSchema.optional(),
});
