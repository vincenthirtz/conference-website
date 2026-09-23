// Contrat de /api/bot/v1/matches/[matchId]/mvp-public — le scrutin DU PUBLIC.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/mvp-public`).
// Module sans effet de bord : zod et utilitaires purs seulement.
//
// DEUX ACTIONS SEULEMENT, et c'est volontaire. Le bot ne peut ni OUVRIR ni
// CLORE ce scrutin : c'est la régie qui le fait, depuis le cockpit, parce que
// c'est elle qui annonce le vote à l'antenne et sait quand le fermer. Le bot
// n'est qu'un second bureau de vote — il ancre son message et relaie des voix.
//
// Même forme que son jumeau `mvp.ts` : un seul objet plutôt qu'une union
// discriminée, les champs conditionnels étant vérifiés dans le handler. Et
// `.nullish()` et non `.optional()` pour la même raison qu'à côté : le bot
// envoie explicitement `null` pour ce qu'il n'a pas encore.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
} from '../../../../../utils/botValidation';

export const mvpPublicBodySchema = z.object({
  action: z.enum(['vote', 'anchor']),
  /** Votante (action `vote`) — son identifiant Discord tient l'unicité. */
  discordUserId: discordIdSchema.nullish(),
  /** Joueuse choisie (action `vote`). */
  memberId: uuidSchema.nullish(),
  /** Où le bot a posté son message (action `anchor`), pour l'éditer ensuite. */
  channelId: z.string().min(1).max(64).nullish(),
  messageId: z.string().min(1).max(64).nullish(),
});
