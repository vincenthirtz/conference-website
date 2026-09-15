// Contrat de /api/bot/v1/scrims/[scrimId]/matches — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.scrims/[scrimId]/matches`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
} from '../../../../../utils/botValidation';

export const VALID_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'walkover',
  'disputed',
  'postponed',
] as const;

// Schéma d'un match d'entrée (single ou élément du batch). Reproduit la
// validation de normalizeMatch : team*_id UUID nullable, status enum (défaut
// 'pending' appliqué côté handler), scheduled_at date ISO, best_of entier >= 1.
export const matchInputSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  is_bye: z.boolean().optional(),
  best_of: z
    .number()
    .int()
    .min(1, 'best_of doit etre un entier >= 1')
    .nullish(),
  match_format: z.string().nullish(),
  team1_id: uuidSchema.nullish(),
  team2_id: uuidSchema.nullish(),
  scheduled_at: isoDateSchema.nullish(),
  stream_url: z.string().nullish(),
  lobby_code: z.string().nullish(),
  notes: z.string().nullish(),
});

// Body POST : { actorDiscordUserId, match } OU { actorDiscordUserId, matches:[] }.
// On valide les deux formes ; le handler choisit selon présence (préserve les
// messages d'erreur "Body doit contenir...", "Aucun match", "Maximum 50").
export const matchesBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  match: matchInputSchema.optional(),
  matches: z.array(matchInputSchema).optional(),
});
