// features/player/library/chat/schemas.ts — corps et paramètres des routes du
// chat de la Women's Library (lot 6 de docs/PLAN-womens-library.md,
// conference-website) : lire le fil d'une salle, écrire, masquer un message,
// mettre en sourdine, signaler un message.
//
// Zod seul, imports RELATIFS (copie synchronisée vers le site,
// lib/apiContracts).
//
// LA FORME ICI, LES RÈGLES DANS LE SERVICE. Le corps d'un message est borné
// LARGE (`LIBRARY_CHAT_BODY_HARD_MAX`) : la règle des 200 caractères est
// appliquée par le service, À SA PLACE dans l'ordre du plan (droits, sourdine,
// rythme, doublon, longueur, filtre), avec un `code` stable que l'interface
// traduit (`chat_too_long`). Le zod ne fait que refuser un corps absurde.

import * as z from 'zod';
import { looseUuid } from '../../_shared/zod';

const ROOM_ID = looseUuid('Salle invalide.');
const MESSAGE_ID = looseUuid('Message invalide.');
const USER_ID = looseUuid('Joueuse invalide.');

/** Un message : 200 caractères au plus (points de code, après nettoyage). */
export const LIBRARY_CHAT_MAX_CHARS = 200;
/** Au-delà, le corps n'est même pas lu (400 `validation`). */
export const LIBRARY_CHAT_BODY_HARD_MAX = 2000;

/** Le fil d'une salle : les N derniers messages lus par une arrivante. */
export const LIBRARY_CHAT_HISTORY_DEFAULT = 50;
export const LIBRARY_CHAT_HISTORY_MAX = 50;

/** Rythme : au plus ce nombre de messages par fenêtre, par joueuse. */
export const LIBRARY_CHAT_RATE = { max: 5, windowMs: 10_000 } as const;
/** Un même message, dans la même salle, dans cette fenêtre : doublon refusé. */
export const LIBRARY_CHAT_DUPLICATE_WINDOW_MS = 60_000;

/** `POST /api/player/library/rooms/{roomId}/messages` — la salle visée. */
export const LibraryChatRoomQuery = z.object({ roomId: ROOM_ID });
export type LibraryChatRoomQueryInput = z.infer<typeof LibraryChatRoomQuery>;

/** `GET /api/player/library/rooms/{roomId}/messages?limit=`. */
export const LibraryChatListQuery = z.object({
  roomId: ROOM_ID,
  limit: z.coerce
    .number({ error: 'Nombre invalide.' })
    .int({ error: 'Nombre invalide.' })
    .min(1, { error: 'Nombre invalide.' })
    .max(LIBRARY_CHAT_HISTORY_MAX, { error: 'Nombre invalide.' })
    .optional(),
});
export type LibraryChatListQueryInput = z.infer<typeof LibraryChatListQuery>;

/** `POST /api/player/library/rooms/{roomId}/messages` — le texte, brut. */
export const LibraryChatSendBody = z.object({
  body: z
    .string({ error: 'Message invalide.' })
    .max(LIBRARY_CHAT_BODY_HARD_MAX, { error: 'Message trop long.' }),
});
export type LibraryChatSendInput = z.infer<typeof LibraryChatSendBody>;

/** `…/messages/{messageId}/hide` et `…/report` — le message visé. */
export const LibraryChatMessageQuery = z.object({
  roomId: ROOM_ID,
  messageId: MESSAGE_ID,
});
export type LibraryChatMessageQueryInput = z.infer<
  typeof LibraryChatMessageQuery
>;

/** Les motifs d'un signalement de message. */
export const LIBRARY_CHAT_REPORT_REASONS = [
  'harassment',
  'hate',
  'personal_info',
  'minor',
  'other',
] as const;
export type LibraryChatReportReason =
  (typeof LIBRARY_CHAT_REPORT_REASONS)[number];

/** Précisions libres d'un signalement, au plus. */
export const LIBRARY_CHAT_REPORT_DETAILS_MAX = 1000;

/** `POST …/messages/{messageId}/report` — signaler un message. */
export const LibraryChatReportBody = z.object({
  reason: z.enum(LIBRARY_CHAT_REPORT_REASONS, { error: 'Motif invalide.' }),
  details: z
    .string({ error: 'Précisions invalides.' })
    .max(LIBRARY_CHAT_REPORT_DETAILS_MAX, { error: 'Précisions trop longues.' })
    .optional(),
});
export type LibraryChatReportInput = z.infer<typeof LibraryChatReportBody>;

/** Sourdine posée dans une salle (propriétaire chez elle, staff) : en minutes. */
export const LIBRARY_CHAT_MUTE_DEFAULT_MINUTES = 30;
export const LIBRARY_CHAT_MUTE_MAX_MINUTES = 1440;
export const LIBRARY_CHAT_MUTE_REASON_MAX = 1000;

/** `POST /api/player/library/rooms/{roomId}/mutes` — mettre en sourdine ici. */
export const LibraryChatMuteBody = z.object({
  userId: USER_ID,
  minutes: z
    .number({ error: 'Durée invalide.' })
    .int({ error: 'Durée invalide.' })
    .min(1, { error: 'Durée invalide.' })
    .max(LIBRARY_CHAT_MUTE_MAX_MINUTES, {
      error: 'Durée trop longue (24 h au plus).',
    })
    .optional(),
  reason: z
    .string({ error: 'Motif invalide.' })
    .trim()
    .max(LIBRARY_CHAT_MUTE_REASON_MAX, { error: 'Motif trop long.' })
    .optional(),
});
export type LibraryChatMuteInput = z.infer<typeof LibraryChatMuteBody>;
