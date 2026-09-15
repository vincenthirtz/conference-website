// Contrat de /api/bot/v1/teams/[teamId]/invitations — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/[teamId]/invitations`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// POST body (création d'invitation). actorDiscordUserId lu par requireBotPlayer
// (body brut). comment/role/battleTag restent optionnels et libres : le handler
// applique slice(COMMENT_MAX) sur comment et createInvitation valide role.
// bodySchema ne s'applique qu'au POST (GET safe → skip).
export const createInvitationBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  targetDiscordUserId: discordIdSchema,
  comment: z.string().optional(),
  role: z.string().optional(),
  battleTag: z.string().optional(),
});
