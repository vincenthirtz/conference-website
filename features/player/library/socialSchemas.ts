// features/player/library/socialSchemas.ts — corps et paramètres des routes
// « multijoueur et sécurité de base » de la Women's Library (lot 5 de
// docs/PLAN-womens-library.md, conference-website) : entrer dans une salle,
// bloquer, signaler, expulser.
//
// Zod seul (copie synchronisée vers le site). À part de `./schemas.ts` (lots 2
// et 4) : un lot, un fichier, pas d'édition croisée.
//
// LA FORME ICI, LES RÈGLES DANS LE SERVICE : « se bloquer soi-même »,
// « signaler une joueuse inconnue » rendent un `code` stable que l'interface
// traduit (`cannot_block_self`, `player_not_found`…).

import * as z from 'zod';
import { looseUuid } from '../_shared/zod';

const USER_ID = looseUuid('Joueuse invalide.');
const ROOM_ID = looseUuid('Salle invalide.');

/**
 * Longueur maximale d'un jeton de présence (lot 14a, `./presenceTicket.ts`) :
 * un jeton réel en fait environ 360.
 */
export const LIBRARY_PRESENCE_TICKET_MAX_CHARS = 1024;

/**
 * Le jeton de présence de la CIBLE, tel que sa présence l'a montré (lot 14a) :
 * signaler, bloquer, expulser ne visent qu'une identité vérifiée. L'API
 * revérifie signature, échéance, salle et compte (`presence_invalid`).
 */
const TARGET_TICKET = z
  .string({ error: 'Présence invalide.' })
  .min(1, { error: 'Présence invalide.' })
  .max(LIBRARY_PRESENCE_TICKET_MAX_CHARS, { error: 'Présence invalide.' });

/** `POST /api/player/library/rooms/{roomId}/enter` — la salle visée. */
export const LibraryRoomIdQuery = z.object({ roomId: ROOM_ID });
export type LibraryRoomIdQueryInput = z.infer<typeof LibraryRoomIdQuery>;

/**
 * `POST /api/player/library/blocks` — bloquer (silencieux, idempotent), une
 * joueuse rencontrée dans une salle : son jeton de présence est exigé.
 */
export const LibraryBlockBody = z.object({
  userId: USER_ID,
  targetTicket: TARGET_TICKET,
});
export type LibraryBlockInput = z.infer<typeof LibraryBlockBody>;

/**
 * `DELETE /api/player/library/blocks?userId=` — lever un blocage, depuis la
 * liste « mes blocages » : par `userId` seul, sans jeton.
 */
export const LibraryUnblockQuery = z.object({ userId: USER_ID });
export type LibraryUnblockInput = z.infer<typeof LibraryUnblockQuery>;

/** Les motifs d'un signalement d'avatar. */
export const LIBRARY_REPORT_REASONS = [
  'harassment',
  'minor',
  'impersonation',
  'other',
] as const;
export type LibraryReportReason = (typeof LIBRARY_REPORT_REASONS)[number];

/** Précisions libres d'un signalement, au plus. */
export const LIBRARY_REPORT_DETAILS_MAX = 1000;

/** `POST /api/player/library/reports` — signaler un avatar. */
export const LibraryReportBody = z.object({
  userId: USER_ID,
  roomId: ROOM_ID,
  targetTicket: TARGET_TICKET,
  reason: z.enum(LIBRARY_REPORT_REASONS, { error: 'Motif invalide.' }),
  details: z
    .string({ error: 'Précisions invalides.' })
    .max(LIBRARY_REPORT_DETAILS_MAX, { error: 'Précisions trop longues.' })
    .optional(),
});
export type LibraryReportInput = z.infer<typeof LibraryReportBody>;

/** Durée d'une expulsion, en minutes. */
export const LIBRARY_KICK_DEFAULT_MINUTES = 30;
export const LIBRARY_KICK_MAX_MINUTES = 1440;

/** `POST /api/player/library/apartment/kick` — expulser de chez soi. */
export const LibraryKickBody = z.object({
  userId: USER_ID,
  targetTicket: TARGET_TICKET,
  minutes: z
    .number({ error: 'Durée invalide.' })
    .int({ error: 'Durée invalide.' })
    .min(1, { error: 'Durée invalide.' })
    .max(LIBRARY_KICK_MAX_MINUTES, {
      error: 'Durée trop longue (24 h au plus).',
    })
    .optional(),
});
export type LibraryKickInput = z.infer<typeof LibraryKickBody>;
