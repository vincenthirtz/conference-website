// Contrat de /api/bot/v1/players/by-discord/[discordUserId]/actions/snooze — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.players/by-discord/[discordUserId]/actions/snooze`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../../../utils/botValidation';

export const MIN_MINUTES = 15;

export const MAX_MINUTES = 1440;

// actionKey : derive d'IDs DB, on autorise [a-z0-9:-_] avec UUID. Max 200.
export const ACTION_KEY_RE = /^[A-Za-z0-9:_\-]{3,200}$/;

export const snoozeBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  actionKey: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => ACTION_KEY_RE.test(s), 'actionKey invalide'),
  // minutes : optionnel/null -> défaut 60 ; sinon entier borné 15..1440.
  // z.coerce.number reproduit le Number(body.minutes) historique.
  minutes: z.coerce
    .number()
    .int()
    .min(MIN_MINUTES, {
      message: `minutes doit etre un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
    })
    .max(MAX_MINUTES, {
      message: `minutes doit etre un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
    })
    .nullish(),
});
