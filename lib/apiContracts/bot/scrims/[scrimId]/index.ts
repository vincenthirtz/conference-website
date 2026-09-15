// Contrat de /api/bot/v1/scrims/[scrimId] — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.scrims/[scrimId]/index`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
  gameSlugSchema,
} from '../../../../../utils/botValidation';

export const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

// PATCH : tous les champs sont optionnels (allowlist PATCHABLE_FIELDS). Les
// champs absents ne sont pas écrits. status est un enum ; team*_id des UUID
// nullable ; scheduled_date une date ISO ; game un slug de jeu. Les autres
// (name, is_public, description, stream_url) restent libres comme dans le
// handler historique (aucune validation inline au-delà du status/UUID/date).
export const scrimPatchBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: z.string().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  team1_id: uuidSchema.nullable().optional(),
  team2_id: uuidSchema.nullable().optional(),
  scheduled_date: isoDateSchema.nullable().optional(),
  is_public: z.union([z.boolean(), z.string()]).optional(),
  description: z.string().nullable().optional(),
  stream_url: z.string().nullable().optional(),
  game: gameSlugSchema.nullable().optional(),
});
