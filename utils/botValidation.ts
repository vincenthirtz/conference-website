// utils/botValidation.ts
//
// Primitives zod partagées pour valider les entrées des routes Discord-bot
// (/api/bot/v1/*). Centralise ce qui était dupliqué inline dans ~40 handlers :
// le regex Discord ID, l'UUID, les bornes de score, les slugs, etc.
//
// Usage : chaque route co-localise son schéma de body/query au-dessus du
// handler et le passe à `withBotRoute(handler, { ..., bodySchema, querySchema })`.
// La validation est faite par le middleware (après auth + résolution tenant),
// qui renvoie 400 { error, code:'INVALID_BODY'|'INVALID_QUERY', fields } et
// injecte le résultat typé dans req.botInput / req.botQuery.
//
// Les regex sont alignées sur les helpers historiques (utils/apiHelpers.ts
// isValidUUID, et le DISCORD_ID_RE de botAuth/botActor) pour ne PAS changer le
// comportement de validation pré-existant — juste le factoriser.

import { z } from 'zod';

// Re-export du formateur d'erreur (messages .describe() en priorité) pour que
// les modules de schéma n'aient qu'un seul import.
export { formatZodError } from './validation';

/** Discord snowflake : 15 à 25 chiffres. Remplace les copies de DISCORD_ID_RE. */
export const discordIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{15,25}$/, 'Discord ID invalide.');

/** UUID (aligné sur UUID_RE / isValidUUID). Insensible à la casse. */
export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'UUID invalide.'
  );

/** Score d'une équipe sur un match : entier 0-99 (borne des handlers report). */
export const scoreSchema = z.number().int().min(0).max(99);

/** Slug d'un jeu : minuscules, alphanumérique + tirets. */
export const gameSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'Identifiant de jeu invalide.');

/** Slug générique (équipe, tournoi, scrim) : alphanumérique + tirets. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/i, 'Slug invalide.');

/** Chaîne de date ISO parseable (Date.parse fini). */
export const isoDateSchema = z
  .string()
  .trim()
  .refine((s) => Number.isFinite(Date.parse(s)), 'Date invalide.');

/** URL http(s) bien formée (rejette javascript:, data:, etc.). */
export const httpUrlSchema = z
  .string()
  .trim()
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'URL invalide.');

/**
 * Chaîne trimmée bornée. min=1 par défaut (champ obligatoire non vide).
 * Utiliser `.optional()` côté schéma de route pour les champs facultatifs.
 */
export const boundedString = (min = 1, max = 255) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max));
