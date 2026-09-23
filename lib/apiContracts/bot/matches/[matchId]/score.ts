// Contrat de /api/bot/v1/matches/[matchId]/score — la saisie de score par le STAFF.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/score`).
// Module sans effet de bord : zod et utilitaires purs seulement.
//
// À NE PAS CONFONDRE avec `/report`, qui est la voie des CAPITAINES : là-bas
// deux reports doivent concorder, et un désaccord met le match en litige. Ici
// le score s'impose — c'est justement ce qu'on veut quand les capitaines ne
// reportent pas, ou qu'un litige traîne pendant la diffusion.
//
// `actorDiscordUserId` n'est pas décoratif : c'est LUI qui porte l'identité.
// Le site remonte `user_discord_links` → `staff.role` et refuse tout ce qui
// n'est pas admin ou owner. Un score qui finalise un match et propage un
// bracket ne se prend pas sur un pseudo.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

export const scoreBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  team1Score: z.number().int().min(0).max(99),
  team2Score: z.number().int().min(0).max(99),
  /**
   * Passer outre le contrôle de format (best-of).
   *
   * Un Bo5 arrêté à 2-1 parce que l'équipe adverse a abandonné en cours de
   * série n'est PAS un score valide au sens du format, et c'est pourtant le
   * score réel. Le staff doit pouvoir le saisir — en le disant explicitement,
   * pour qu'une faute de frappe reste refusée par défaut.
   */
  allowIncompleteSeries: z.boolean().nullish(),
});
