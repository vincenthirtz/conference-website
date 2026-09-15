// Contrat de /api/bot/v1/role-sync/presence — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.role-sync/presence`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../utils/botValidation';

/** Même ordre de grandeur que free-players/sync : un guild, pas une fédération. */
export const MAX_MEMBERS = 5000;

export const presenceBodySchema = z.object({
  members: z
    .array(
      z.object({
        discordUserId: discordIdSchema,
        inGuild: z.boolean(),
      })
    )
    .max(MAX_MEMBERS),
  /**
   * Défaut 'replace' : c'est le contrat historique, et un bot d'une version
   * antérieure (qui n'envoie pas le champ) doit continuer à faire un full
   * replace de fin de cycle.
   */
  mode: z.enum(['replace', 'upsert']).optional().default('replace'),
});
