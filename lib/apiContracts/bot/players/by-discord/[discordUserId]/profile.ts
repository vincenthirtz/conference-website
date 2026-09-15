// Contrat de /api/bot/v1/players/by-discord/[discordUserId]/profile — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.players/by-discord/[discordUserId]/profile`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../../utils/botValidation';
import { BATTLE_TAG_REGEX } from '../../../../../../utils/teams/roleKind';

// Source unique partagée avec le site (utils/teams/roleKind) : lettres de
// tout script + accents, suffixe numérique. Évite qu'un tag accepté par le
// bot soit refusé par le site (ou l'inverse).
export const BATTLE_TAG_RE = BATTLE_TAG_REGEX;

export const DISPLAY_NAME_MAX = 50;

export const RANK_MAX = 30;

// displayName : optionnel ; null pour effacer ; sinon string trimmée bornée,
// vide -> null (efface). Préserve la sémantique inline ('field' in body).
export const displayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length <= DISPLAY_NAME_MAX, {
    message: `displayName trop long (max ${DISPLAY_NAME_MAX}).`,
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

// battleTag : null pour effacer ; sinon format Name#0000 (vide autorisé -> null).
export const battleTagSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s === '' || BATTLE_TAG_RE.test(s), {
    message: 'Format BattleTag invalide (ex: Pseudo#1234).',
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

// mainRole : enum Overwatch (lowercased) ; null pour effacer ; vide -> null.
export const ROLE_VALUES = ['tank', 'damage', 'support'] as const;

export const mainRoleSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s === '' || (ROLE_VALUES as readonly string[]).includes(s), {
    message: `mainRole invalide. Valeurs : ${ROLE_VALUES.join(', ')}.`,
  })
  .transform((s) => (s || null) as (typeof ROLE_VALUES)[number] | null)
  .nullable()
  .optional();

// rank : str libre bornée ; null pour effacer ; vide -> null.
export const rankSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length <= RANK_MAX, {
    message: `rank trop long (max ${RANK_MAX}).`,
  })
  .transform((s) => s || null)
  .nullable()
  .optional();

export const profileBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  displayName: displayNameSchema,
  battleTag: battleTagSchema,
  mainRole: mainRoleSchema,
  rank: rankSchema,
});
