// features/admin/library/schemas.ts — bannissements de la Women's Library
// (`/api/admin/library/bans`, lot 5 de docs/PLAN-womens-library.md,
// conference-website). Réservé au staff qui a `moderate_support`.
//
// zod seul, imports RELATIFS : schémas référencés par la spec OpenAPI.

import * as z from 'zod';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userId = z
  .string({ error: 'Joueuse invalide.' })
  .regex(UUID_RE, { error: 'Joueuse invalide.' });

/** Motif d'un bannissement : obligatoire (la décision se justifie). */
export const LIBRARY_BAN_REASON_MAX = 1000;

/** GET — `active` : `true` (en cours, défaut), `false` (levés ou échus), `all`. */
export const LibraryBanListQuery = z.object({
  active: z.enum(['true', 'false', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
export type LibraryBanListInput = z.infer<typeof LibraryBanListQuery>;

/**
 * POST — la joueuse est désignée par son identifiant de compte OU par son
 * pseudo de la Library (celui que porte le ticket de signalement), jamais
 * les deux. `until` absent ou `null` = définitif.
 */
export const LibraryBanCreateBody = z
  .object({
    userId: userId.optional(),
    nickname: z
      .string({ error: 'Pseudo invalide.' })
      .trim()
      .min(3, { error: 'Pseudo invalide.' })
      .max(20, { error: 'Pseudo invalide.' })
      .optional(),
    reason: z
      .string({ error: 'Motif requis.' })
      .trim()
      .min(1, { error: 'Motif requis.' })
      .max(LIBRARY_BAN_REASON_MAX, { error: 'Motif trop long.' }),
    until: z
      .string({ error: 'Échéance invalide.' })
      .datetime({ offset: true, error: 'Échéance invalide.' })
      .nullable()
      .optional(),
  })
  .refine((b) => (b.userId === undefined) !== (b.nickname === undefined), {
    error: 'Désigner la joueuse par son identifiant OU son pseudo.',
    path: ['userId'],
  });
export type LibraryBanCreateInput = z.infer<typeof LibraryBanCreateBody>;

/** DELETE — lever TOUS les bannissements en cours de la joueuse. */
export const LibraryBanLiftQuery = z.object({ userId });
export type LibraryBanLiftInput = z.infer<typeof LibraryBanLiftQuery>;
