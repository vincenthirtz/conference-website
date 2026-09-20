// Contrat de /api/bot/v1/matches/[matchId]/mvp — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/mvp`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
} from '../../../../../utils/botValidation';

// Un seul objet plutôt qu'une union discriminée : les champs conditionnels sont
// vérifiés dans le handler, qui rend un message par action. Une union produirait
// ici un `anyOf` illisible dans la spec pour trois formes très proches.
export const mvpBodySchema = z.object({
  action: z.enum(['open', 'vote', 'close']),
  /** Votante (action `vote`) — son identifiant Discord tient l'unicité. */
  discordUserId: discordIdSchema.optional(),
  /** Joueuse choisie (action `vote`). */
  memberId: uuidSchema.optional(),
  /** Ancrage du message posté par le bot (action `open`). */
  channelId: z.string().min(1).max(64).optional(),
  messageId: z.string().min(1).max(64).optional(),
  /** Fenêtre de vote en heures (action `open`), 24 par défaut. */
  durationHours: z.number().int().min(1).max(168).optional(),
});
