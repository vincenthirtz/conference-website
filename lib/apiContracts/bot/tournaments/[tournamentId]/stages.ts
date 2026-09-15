// Contrat de /api/bot/v1/tournaments/[tournamentId]/stages — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tournaments/[tournamentId]/stages`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
  slugSchema,
  isoDateSchema,
} from '../../../../../utils/botValidation';

export const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
] as const;

// Le handler accepte les deux casses (snake_case + camelCase) pour
// stage_type / order_index / is_public / is_active. Le schéma valide chaque
// alias indépendamment ; la résolution alias→valeur reste dans le handler
// pour préserver exactement la priorité historique (snake_case d'abord).
export const orderIndexSchema = z.number().int().min(0);

export const createStageBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: boundedString(1, 255),
  stage_type: z.enum(VALID_STAGE_TYPES).optional(),
  stageType: z.enum(VALID_STAGE_TYPES).optional(),
  slug: slugSchema.optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  order_index: orderIndexSchema.optional(),
  orderIndex: orderIndexSchema.optional(),
  is_public: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
