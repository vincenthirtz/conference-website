// Contrat de /api/bot/v1/matches/[matchId]/forfeit-proposal/{confirm,decline}
// — corps commun aux deux boutons du DM « proposition de forfait ».
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/forfeit-proposal`,
// cf. lib/apiContracts/index.ts). Module sans effet de bord : zod et
// utilitaires purs seulement.

import * as z from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

export const forfeitProposalBodySchema = z.object({
  /** Admin/owner du tenant qui a cliqué (act-as, journal staff). */
  actorDiscordUserId: discordIdSchema,
});
