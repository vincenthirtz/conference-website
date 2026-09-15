// Contrat de /api/bot/v1/teams — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/index`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  boundedString,
  discordIdSchema,
} from '../../../../utils/botValidation';

export const NAME_MIN = 2;

export const NAME_MAX = 100;

export const DESC_MAX = 2000;

// POST body. name 2-100, captainDiscordUserId requis. Le reste optionnel.
// NB volontaire : logoUrl / website ne sont PAS validés via httpUrlSchema ici
// — le handler historique les passe à sanitizeUrl() qui *null-ifie* une URL
// invalide au lieu de rejeter la requête. Un httpUrlSchema renverrait 400 et
// changerait le contrat. On garde donc des strings libres + sanitizeUrl dans
// le handler. Idem `slug` : transformé via slugify, jamais rejeté.
export const createTeamBodySchema = z.object({
  name: boundedString(NAME_MIN, NAME_MAX),
  captainDiscordUserId: discordIdSchema,
  slug: z.string().optional(),
  shortName: z.string().optional(),
  logoUrl: z.string().optional(),
  // Borne sur la longueur APRÈS trim (comme le handler historique).
  description: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(DESC_MAX))
    .optional(),
  country: z.string().optional(),
  discord: z.string().optional(),
  website: z.string().optional(),
});
