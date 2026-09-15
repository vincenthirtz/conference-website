// Contrat de /api/bot/v1/invitations/[demandeId] — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.invitations/[demandeId]`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../utils/botValidation';

// action : trim + lowercase historique, puis enum strict. actorDiscordUserId
// est lu par requireBotPlayer sur le body brut ; on le valide aussi ici.
export const invitationBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject', 'cancel'])),
});
