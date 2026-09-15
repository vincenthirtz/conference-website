// Contrat de /api/bot/v1/scrims/[scrimId]/matches/[matchId] — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.scrims/[scrimId]/matches/[matchId]`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
} from '../../../../../../utils/botValidation';

export const VALID_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'walkover',
  'disputed',
  'postponed',
] as const;

// scoreSchema (0-99) ne convient pas ici : le handler historique borne juste
// "entier >= 0" sans plafond. On reproduit cette borne pour ne pas changer la
// sémantique (un score de scrim peut théoriquement dépasser 99).
export const matchScoreSchema = z
  .number()
  .int()
  .min(0, 'team_score doit etre un entier >= 0');

// PATCH : allowlist PATCHABLE_FIELDS, tous optionnels. Le contrôle
// winner/forfeit "doit référencer team1/team2 du match" dépend de la row DB →
// reste inline dans le handler. La dérivation du gagnant idem.
export const scrimMatchPatchBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  team1_score: matchScoreSchema.nullish(),
  team2_score: matchScoreSchema.nullish(),
  winner_team_id: uuidSchema.nullish(),
  forfeit_team_id: uuidSchema.nullish(),
  status: z.enum(VALID_STATUSES).optional(),
  best_of: z
    .number()
    .int()
    .min(1, 'best_of doit etre un entier >= 1')
    .nullish(),
  match_format: z.string().nullish(),
  stream_url: z.string().nullish(),
  replay_url: z.string().nullish(),
  lobby_code: z.string().nullish(),
  notes: z.string().nullish(),
  scheduled_at: isoDateSchema.nullish(),
  started_at: isoDateSchema.nullish(),
  completed_at: isoDateSchema.nullish(),
});
