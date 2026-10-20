// features/admin/library/chatSchemas.ts — modération du chat de la Women's
// Library depuis le hub (`/api/admin/library/messages`, `…/mutes`,
// `…/chat-settings` ; lot 6 de docs/PLAN-womens-library.md,
// conference-website). Réservé au staff qui a `moderate_support`.
//
// zod seul, imports RELATIFS : schémas référencés par la spec OpenAPI, copie
// synchronisée vers le site (le formulaire valide avec les mêmes bornes).

import * as z from 'zod';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (message: string) =>
  z.string({ error: message }).regex(UUID_RE, { error: message });

/** Une page de messages récents, au plus. */
export const LIBRARY_CHAT_ADMIN_PAGE_DEFAULT = 50;
export const LIBRARY_CHAT_ADMIN_PAGE_MAX = 100;

/**
 * GET /api/admin/library/messages — les messages récents de l'espace, masqués
 * compris, du plus récent au plus ancien. `roomId` : une salle seulement.
 * `cursor` : la date (ISO) du dernier message de la page précédente.
 */
export const LibraryChatAdminListQuery = z.object({
  roomId: uuid('Salle invalide.').optional(),
  cursor: z
    .string({ error: 'Curseur invalide.' })
    .datetime({ offset: true, error: 'Curseur invalide.' })
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIBRARY_CHAT_ADMIN_PAGE_MAX)
    .optional(),
});
export type LibraryChatAdminListInput = z.infer<
  typeof LibraryChatAdminListQuery
>;

/** POST /api/admin/library/messages/hide — masquer un message, partout. */
export const LibraryChatAdminHideBody = z.object({
  messageId: uuid('Message invalide.'),
});
export type LibraryChatAdminHideInput = z.infer<
  typeof LibraryChatAdminHideBody
>;

/** Sourdine posée depuis le hub : 30 jours au plus (au-delà : bannir). */
export const LIBRARY_CHAT_ADMIN_MUTE_MAX_MINUTES = 43_200;
export const LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX = 1000;

/**
 * POST /api/admin/library/mutes — mettre en sourdine. La joueuse est
 * désignée par `userId` OU par `nickname` (jamais les deux), comme pour un
 * bannissement. `roomId` absent ou `null` = toute la Library. Motif
 * obligatoire (la décision se justifie).
 */
export const LibraryChatAdminMuteBody = z
  .object({
    userId: uuid('Joueuse invalide.').optional(),
    nickname: z
      .string({ error: 'Pseudo invalide.' })
      .trim()
      .min(3, { error: 'Pseudo invalide.' })
      .max(20, { error: 'Pseudo invalide.' })
      .optional(),
    roomId: uuid('Salle invalide.').nullable().optional(),
    minutes: z
      .number({ error: 'Durée invalide.' })
      .int({ error: 'Durée invalide.' })
      .min(1, { error: 'Durée invalide.' })
      .max(LIBRARY_CHAT_ADMIN_MUTE_MAX_MINUTES, {
        error: 'Durée trop longue (30 jours au plus).',
      }),
    reason: z
      .string({ error: 'Motif requis.' })
      .trim()
      .min(1, { error: 'Motif requis.' })
      .max(LIBRARY_CHAT_ADMIN_MUTE_REASON_MAX, { error: 'Motif trop long.' }),
  })
  .refine((b) => (b.userId === undefined) !== (b.nickname === undefined), {
    error: 'Désigner la joueuse par son identifiant OU son pseudo.',
    path: ['userId'],
  });
export type LibraryChatAdminMuteInput = z.infer<
  typeof LibraryChatAdminMuteBody
>;

/** GET /api/admin/library/mutes — sourdines EN COURS. */
export const LibraryChatAdminMuteListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type LibraryChatAdminMuteListInput = z.infer<
  typeof LibraryChatAdminMuteListQuery
>;

/** DELETE /api/admin/library/mutes?id= — lever une sourdine. */
export const LibraryChatAdminMuteLiftQuery = z.object({
  id: uuid('Sourdine invalide.'),
});
export type LibraryChatAdminMuteLiftInput = z.infer<
  typeof LibraryChatAdminMuteLiftQuery
>;

/** PUT /api/admin/library/chat-settings — ouvrir ou fermer le chat de l'espace. */
export const LibraryChatSettingsBody = z.object({
  enabled: z.boolean({ error: 'Valeur invalide.' }),
});
export type LibraryChatSettingsInput = z.infer<typeof LibraryChatSettingsBody>;
