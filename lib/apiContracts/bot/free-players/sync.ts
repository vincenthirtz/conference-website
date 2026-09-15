// Contrat de /api/bot/v1/free-players/sync — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.free-players/sync`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
} from '../../../../utils/botValidation';

export const USERNAME_MAX = 100;

export const MAX_PLAYERS = 5000;

// Body : { players: [{ discordUserId, discordUsername?, displayName? }] }.
// displayName est accepté (le bot l'envoie) mais on persiste discordUsername ;
// si discordUsername est absent on retombe sur displayName.
export const syncBodySchema = z.object({
  players: z
    .array(
      z.object({
        discordUserId: discordIdSchema,
        discordUsername: boundedString(1, USERNAME_MAX).optional(),
        displayName: boundedString(1, USERNAME_MAX).optional(),
      })
    )
    .max(MAX_PLAYERS),
});
