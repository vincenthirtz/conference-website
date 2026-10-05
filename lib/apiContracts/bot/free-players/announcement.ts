// Contrat de /api/bot/v1/free-players/announcement — où le bot a posté
// l'annonce d'une fiche « joueuse libre ». Source unique handler ↔ spec OpenAPI
// (`x-zod: bot.free-players/announcement`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import * as z from 'zod';
import { discordIdSchema, uuidSchema } from '../../../../utils/botValidation';

// Body : { freePlayerId, channelId, messageId }.
//
// `freePlayerId` vient de l'event `free_player.registered` — le bot ne fait que
// le renvoyer. Les deux identifiants Discord sont ce que le site devra lui
// rendre, dans `free_player.withdrawn`, pour faire supprimer le message.
export const announcementBodySchema = z.object({
  freePlayerId: uuidSchema,
  channelId: discordIdSchema,
  messageId: discordIdSchema,
});
