// Contrat de /api/bot/v1/matches/[matchId]/mvp-public — le scrutin DU PUBLIC.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/mvp-public`).
// Module sans effet de bord : zod et utilitaires purs seulement.
//
// QUATRE ACTIONS. `vote` et `anchor` : le bot comme second bureau de vote.
// `open` et `close` : depuis le 2026-09-27, un ADMIN peut aussi lancer et clore
// le vote du public depuis Discord (`/mvp-public`), pour un match sans régie
// — décision de l'orga. La régie reste l'autorité quand elle diffuse : un vote
// ouvert hors cockpit ne reçoit pas les `!mvp` du chat Twitch, que seul le
// cockpit relaie. Le gate admin est côté bot (rôles Discord).
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
  action: z.enum(['vote', 'anchor', 'open', 'close']),
  /**
   * Votante (action `vote`) — son identifiant Discord tient l'unicité.
   * Admin qui agit (actions `open` / `close`) — pour la trace.
   */
  discordUserId: discordIdSchema.nullish(),
  /** Durée du scrutin en minutes (action `open`), 1 → 360, défaut 10. */
  windowMinutes: z.number().int().min(1).max(360).nullish(),
  /** Joueuse choisie (action `vote`). */
  memberId: uuidSchema.nullish(),
  /** Où le bot a posté son message (action `anchor`), pour l'éditer ensuite. */
  channelId: z.string().min(1).max(64).nullish(),
  messageId: z.string().min(1).max(64).nullish(),
});
