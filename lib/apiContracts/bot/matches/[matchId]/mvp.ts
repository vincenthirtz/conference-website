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
// `.nullish()` et non `.optional()` : le bot envoie explicitement `null` pour
// ce qu'il n'a pas encore. À la PREMIÈRE ouverture, `messageId` VAUT null — le
// message n'est posté qu'ensuite, et c'est un second appel qui l'ancre. Avec
// `.optional()`, zod refusait ce null (« expected string, received null ») et
// rendait 400 : aucun vote ne pouvait s'ouvrir, ni à la main ni à la fin d'un
// match. Absent et « connu comme vide » sont deux choses, et l'API doit
// accepter les deux.
export const mvpBodySchema = z.object({
  action: z.enum(['open', 'vote', 'close']),
  /** Votante (action `vote`) — son identifiant Discord tient l'unicité. */
  discordUserId: discordIdSchema.nullish(),
  /** Joueuse choisie (action `vote`). */
  memberId: uuidSchema.nullish(),
  /** Ancrage du message posté par le bot (action `open`). */
  channelId: z.string().min(1).max(64).nullish(),
  messageId: z.string().min(1).max(64).nullish(),
  /** Fenêtre de vote en heures (action `open`), 48 par défaut. */
  durationHours: z.number().int().min(1).max(168).nullish(),
  /**
   * RELANCE (action `open`) : repartir de zéro sur un scrutin déjà ouvert.
   *
   * Sans elle, un vote posté ne peut plus jamais être reposté — l'ancrage
   * Discord est reconduit à chaque appel, et le bot refuse tant qu'un
   * `discord_message_id` existe, même si le message a été supprimé. La relance
   * refige les candidates, remet la fenêtre à zéro, efface l'ancrage et PURGE
   * les voix (la liste ayant changé, les anciennes fausseraient le décompte).
   */
  force: z.boolean().nullish(),
});
